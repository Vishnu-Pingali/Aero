import asyncio
import json
import logging
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.cache.manager import CacheManager
from app.config import Settings
from app.models.flights import Aircraft, AircraftRoute, FlightsResponse, RoutePoint
from app.utils.airports import airport_coords
from app.utils.bbox import normalize_bbox
from app.utils.json_store import get_aircraft, upsert_aircraft


@lru_cache(maxsize=512)
def _airport_coords_cached(iata: str) -> tuple[float, float, str] | None:
    """Thin LRU-cached wrapper around airport_coords.

    AIRPORT_DB is a module-level constant so caching is always safe.
    Avoids redundant dict lookups when many flights share the same
    origin/destination (e.g. dozens of flights from JFK in one batch).
    """
    return airport_coords(iata)

logger = logging.getLogger(__name__)


class AirLabsService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, cache: CacheManager) -> None:
        self._settings = settings
        self._client = client
        self._cache = cache
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0
        self._api_key = self._load_api_key()

    @property
    def api_key_configured(self) -> bool:
        return bool(self._api_key)

    async def get_default_flights(self) -> FlightsResponse:
        return await self.get_region_flights(*self._settings.default_bbox)

    async def get_region_flights(self, lamin: float, lomin: float, lamax: float, lomax: float) -> FlightsResponse:
        bbox = _clamp_to_default_bbox((lamin, lomin, lamax, lomax), self._settings.default_bbox)
        bbox = normalize_bbox(*bbox, self._settings.max_bbox_area_degrees)
        key = f"airlabs:flights:{bbox}"
        return await self._cache.get_or_set(
            key,
            self._settings.airlabs_cache_ttl_seconds,
            lambda: self._fetch_flights(bbox),
        )

    async def get_aircraft_near(
        self,
        icao24: str,
        latitude: float,
        longitude: float,
        aircraft_cache_path: Path | None = None,
    ) -> Aircraft:
        """Locate the aircraft by ICAO24, progressively widening the search area.

        Checks aircraft_cache.json first so that a second user clicking the same
        plane gets instant data without re-hitting AirLabs.

        AirLabs data may be slightly stale, so we try three increasing bboxes:
        1. Small ±1° box around the last-known position (fast, avoids large API calls)
        2. Medium ±3° box, in case the aircraft has moved further since last poll
        3. Full default bbox as final fallback
        """
        normalized_icao = icao24.lower()

        # ── Check JSON aircraft cache first ───────────────────────────────────
        if aircraft_cache_path is not None:
            cached = await get_aircraft(aircraft_cache_path, normalized_icao, max_age_seconds=600)
            if cached is not None:
                try:
                    # Remove the housekeeping field before deserialising
                    cached.pop("cached_at", None)
                    aircraft = Aircraft(**cached)
                    logger.debug("Aircraft %s served from JSON cache", icao24.upper())
                    return aircraft
                except Exception as exc:
                    logger.warning("Aircraft cache deserialise failed for %s: %s", icao24, exc)

        # ── Live fetch ────────────────────────────────────────────────────────
        margins = [1.0, 3.0]  # degrees; full default bbox is the final fallback
        for margin in margins:
            bbox = _small_bbox(latitude, longitude, self._settings.default_bbox, margin=margin)
            response = await self._fetch_flights(bbox, respect_interval=False)
            for flight in response.flights:
                if flight.icao24.lower() == normalized_icao:
                    if aircraft_cache_path is not None:
                        try:
                            await upsert_aircraft(aircraft_cache_path, normalized_icao, flight.model_dump())
                        except Exception as exc:
                            logger.warning("Failed to persist aircraft %s to cache: %s", icao24, exc)
                    return flight

        # Final fallback: scan the entire default region
        response = await self._fetch_flights(self._settings.default_bbox, respect_interval=False)
        for flight in response.flights:
            if flight.icao24.lower() == normalized_icao:
                if aircraft_cache_path is not None:
                    try:
                        await upsert_aircraft(aircraft_cache_path, normalized_icao, flight.model_dump())
                    except Exception as exc:
                        logger.warning("Failed to persist aircraft %s to cache: %s", icao24, exc)
                return flight

        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Aircraft {icao24.upper()} was not found in the current AirLabs feed. "
            "It may have landed or be outside the monitored region.",
        )

    async def get_aircraft_route(
        self,
        icao24: str,
        latitude: float,
        longitude: float,
        aircraft_cache_path: Path | None = None,
    ) -> AircraftRoute:
        """Return a route with origin → current → destination waypoints.

        A partial route (e.g. only current → destination, or only origin → current)
        is still returned as long as at least two distinct points are available.
        """
        aircraft = await self.get_aircraft_near(
            icao24, latitude, longitude, aircraft_cache_path=aircraft_cache_path
        )
        aircraft = await self._hydrate_route_airports(aircraft)

        # Persist the hydrated aircraft (with origin/dest coords) back to cache
        if aircraft_cache_path is not None:
            try:
                await upsert_aircraft(aircraft_cache_path, icao24.lower(), aircraft.model_dump())
            except Exception as exc:
                logger.warning("Failed to persist hydrated aircraft %s to cache: %s", icao24, exc)

        points = _route_points(aircraft)
        if len(points) < 2:
            # Still return something useful: current position only, so the frontend
            # can at least show the aircraft's live location with metadata.
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "No origin or destination airport coordinates are available for this flight.",
            )
        return AircraftRoute(aircraft=aircraft, points=points)

    async def get_altitude_filtered(
        self,
        min_alt: int | None,
        max_alt: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> FlightsResponse:
        if min_alt is not None and max_alt is not None and min_alt > max_alt:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "min_alt must be less than max_alt.")
        response = await self.get_default_flights() if bbox is None else await self.get_region_flights(*bbox)
        flights = [
            flight
            for flight in response.flights
            if flight.altitude_ft is not None
            and (min_alt is None or flight.altitude_ft >= min_alt)
            and (max_alt is None or flight.altitude_ft <= max_alt)
        ]
        return response.model_copy(update={"count": len(flights), "flights": flights})

    async def probe_live_data(self) -> dict[str, object]:
        started = time.monotonic()
        bbox = self._settings.default_bbox
        try:
            response = await self._fetch_flights(bbox)
            return {
                "ok": True,
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "bbox": bbox,
                "count": response.count,
                "source_time": response.source_time,
                "api_key_configured": bool(self._api_key),
            }
        except Exception as exc:
            logger.exception("AirLabs live probe failed")
            return {
                "ok": False,
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "bbox": bbox,
                "error_type": type(exc).__name__,
                "error": str(exc),
                "api_key_configured": bool(self._api_key),
            }

    async def _fetch_flights(
        self,
        bbox: tuple[float, float, float, float],
        respect_interval: bool = True,
    ) -> FlightsResponse:
        if not self._api_key:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AirLabs API key is not configured.")

        if respect_interval:
            await self._respect_min_interval()
        response = await self._client.get(
            f"{self._settings.airlabs_base_url.rstrip('/')}/flights",
            params={"api_key": self._api_key, "bbox": ",".join(str(value) for value in bbox)},
            headers={"Accept": "application/json"},
        )
        if response.status_code == 429:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "AirLabs rate limit reached; retry shortly.")
        if response.status_code >= 500:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AirLabs service is temporarily unavailable.")
        if response.status_code >= 400:
            logger.warning("AirLabs flights request failed: %s %s", response.status_code, response.text[:200])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AirLabs flights request failed.")

        payload = response.json()
        rows = _flight_rows(payload)
        flights = [aircraft for row in rows if (aircraft := _parse_aircraft(row)) is not None]
        flights = flights[: self._settings.max_aircraft_returned]
        return FlightsResponse(source_time=_source_time(payload), count=len(flights), bbox=bbox, flights=flights)

    async def _hydrate_route_airports(self, aircraft: Aircraft) -> Aircraft:
        """Resolve origin and destination airport coordinates.

        Strategy (fastest-first):
        1. If the AirLabs /flights response already included lat/lon fields
           (dep_lat / arr_lat) they were parsed into Aircraft at read time — use them.
        2. Look up the IATA code in the bundled offline airport database — instant,
           zero API calls, covers ~600 major airports worldwide.
        3. Fall back to the AirLabs /airports API for anything not in the local DB
           (smaller regional or private airports).

        Only fields that are still None after each step are filled in, so earlier
        (more reliable) sources are never overwritten by later ones.
        """
        updates: dict[str, object] = {}

        # ── Origin ────────────────────────────────────────────────────────────
        origin_local = _airport_coords_cached(aircraft.origin_iata.upper()) if aircraft.origin_iata else None
        if aircraft.origin_latitude is None or aircraft.origin_longitude is None:
            # Step 2: local DB
            if origin_local:
                lat, lon, name = origin_local
                updates["origin_latitude"] = lat
                updates["origin_longitude"] = lon
                if not aircraft.origin_name:
                    updates["origin_name"] = name
            else:
                # Step 3: AirLabs API
                api = await self._airport_for(aircraft.origin_iata, aircraft.origin_icao)
                if api:
                    updates.update(_airport_updates(api, "origin", aircraft))
        elif not aircraft.origin_name and origin_local:
            # Coords already known — reuse the lookup result we already have
            updates["origin_name"] = origin_local[2]

        # ── Destination ───────────────────────────────────────────────────────
        dest_local = _airport_coords_cached(aircraft.destination_iata.upper()) if aircraft.destination_iata else None
        if aircraft.destination_latitude is None or aircraft.destination_longitude is None:
            # Step 2: local DB
            if dest_local:
                lat, lon, name = dest_local
                updates["destination_latitude"] = lat
                updates["destination_longitude"] = lon
                if not aircraft.destination_name:
                    updates["destination_name"] = name
            else:
                # Step 3: AirLabs API
                api = await self._airport_for(aircraft.destination_iata, aircraft.destination_icao)
                if api:
                    updates.update(_airport_updates(api, "destination", aircraft))
        elif not aircraft.destination_name and dest_local:
            # Reuse the lookup result we already have
            updates["destination_name"] = dest_local[2]

        return aircraft.model_copy(update=updates) if updates else aircraft

    async def _airport_for(self, iata: str | None, icao: str | None) -> dict[str, Any] | None:
        for code_type, code in (("iata_code", iata), ("icao_code", icao)):
            if not code:
                continue
            key = f"airlabs:airport:{code_type}:{code.upper()}"
            airport = await self._cache.get_or_set(
                key,
                86400,
                lambda code_type=code_type, code=code: self._fetch_airport(code_type, code),
            )
            if airport:
                return airport
        return None

    async def _fetch_airport(self, code_type: str, code: str) -> dict[str, Any] | None:
        if not self._api_key:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AirLabs API key is not configured.")
        response = await self._client.get(
            f"{self._settings.airlabs_base_url.rstrip('/')}/airports",
            params={"api_key": self._api_key, code_type: code.upper()},
            headers={"Accept": "application/json"},
        )
        if response.status_code >= 400:
            logger.warning("AirLabs airport request failed: %s %s", response.status_code, response.text[:200])
            return None
        rows = _response_rows(response.json())
        return rows[0] if rows else None

    async def _respect_min_interval(self) -> None:
        async with self._request_lock:
            elapsed = time.monotonic() - self._last_request_at
            wait_for = self._settings.airlabs_min_request_interval_seconds - elapsed
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_request_at = time.monotonic()

    def _load_api_key(self) -> str | None:
        if self._settings.airlabs_api_key:
            return self._settings.airlabs_api_key
        for path in (self._settings.airlabs_credentials_path, self._settings.airlabs_fallback_credentials_path):
            if not path.exists():
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                logger.warning("Unable to load AirLabs credentials from %s", path)
                continue
            for key in ("airlabs_api_key", "api_key", "key"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return None


def _airport_updates(api: dict[str, Any], role: str, aircraft: Aircraft) -> dict[str, object]:
    """Build a model-update dict from an AirLabs /airports API response row.

    *role* is either ``"origin"`` or ``"destination"``.
    Only fills in fields that are still ``None`` on *aircraft*.
    """
    updates: dict[str, object] = {}
    lat = _float_or_none(api.get("lat") or api.get("latitude"))
    lon = _float_or_none(api.get("lng") or api.get("lon") or api.get("longitude"))
    name = api.get("name")
    iata = api.get("iata_code")
    icao = api.get("icao_code")

    if lat is not None and getattr(aircraft, f"{role}_latitude") is None:
        updates[f"{role}_latitude"] = lat
    if lon is not None and getattr(aircraft, f"{role}_longitude") is None:
        updates[f"{role}_longitude"] = lon
    if name and not getattr(aircraft, f"{role}_name"):
        updates[f"{role}_name"] = name
    if iata and not getattr(aircraft, f"{role}_iata"):
        updates[f"{role}_iata"] = str(iata).upper()
    if icao and not getattr(aircraft, f"{role}_icao"):
        updates[f"{role}_icao"] = str(icao).upper()
    return updates


def _clamp_to_default_bbox(
    bbox: tuple[float, float, float, float],
    default_bbox: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    lamin, lomin, lamax, lomax = bbox
    default_lamin, default_lomin, default_lamax, default_lomax = default_bbox
    clamped = (
        max(lamin, default_lamin),
        max(lomin, default_lomin),
        min(lamax, default_lamax),
        min(lomax, default_lomax),
    )
    if clamped[0] >= clamped[2] or clamped[1] >= clamped[3]:
        return default_bbox
    return clamped


def _small_bbox(
    latitude: float,
    longitude: float,
    default_bbox: tuple[float, float, float, float],
    margin: float = 1.0,
) -> tuple[float, float, float, float]:
    """Build a bounding box *margin* degrees around a lat/lon, clamped to default_bbox."""
    default_lamin, default_lomin, default_lamax, default_lomax = default_bbox
    lamin = max(default_lamin, latitude - margin)
    lomin = max(default_lomin, longitude - margin)
    lamax = min(default_lamax, latitude + margin)
    lomax = min(default_lomax, longitude + margin)
    if lamin >= lamax or lomin >= lomax:
        return default_bbox
    return (round(lamin, 5), round(lomin, 5), round(lamax, 5), round(lomax, 5))


def _route_points(aircraft: Aircraft) -> list[RoutePoint]:
    """Build ordered route waypoints: origin → current position → destination.

    Only includes origin/destination if their coordinates are known.
    The current position is always included as a reference point.
    Adjacent duplicate coordinates (e.g. airport == current pos on ground) are
    collapsed so the resulting polyline is meaningful.
    """
    points: list[RoutePoint] = []

    current = RoutePoint(
        type="current",
        label=aircraft.callsign or aircraft.icao24.upper(),
        latitude=aircraft.latitude,
        longitude=aircraft.longitude,
    )

    if aircraft.origin_latitude is not None and aircraft.origin_longitude is not None:
        origin = RoutePoint(
            type="origin",
            label=aircraft.origin_iata or aircraft.origin_icao or "Origin",
            latitude=aircraft.origin_latitude,
            longitude=aircraft.origin_longitude,
        )
        # Don't add origin if it's essentially the same as current position (on ground)
        if not _coords_equal(origin, current):
            points.append(origin)

    points.append(current)

    if aircraft.destination_latitude is not None and aircraft.destination_longitude is not None:
        dest = RoutePoint(
            type="destination",
            label=aircraft.destination_iata or aircraft.destination_icao or "Destination",
            latitude=aircraft.destination_latitude,
            longitude=aircraft.destination_longitude,
        )
        # Don't add destination if it's the same as current (aircraft just landed)
        if not _coords_equal(dest, current):
            points.append(dest)

    return points


def _coords_equal(a: RoutePoint, b: RoutePoint, tol: float = 0.01) -> bool:
    """Return True if two route points are within *tol* degrees of each other."""
    return abs(a.latitude - b.latitude) < tol and abs(a.longitude - b.longitude) < tol


def _flight_rows(payload: Any) -> list[dict[str, Any]]:
    rows = _response_rows(payload)
    if rows:
        return rows
    return []


def _response_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    response = payload.get("response")
    if isinstance(response, list):
        return [row for row in response if isinstance(row, dict)]
    if isinstance(response, dict):
        flights = response.get("flights") or response.get("data")
        if isinstance(flights, list):
            return [row for row in flights if isinstance(row, dict)]
        return [response]
    data = payload.get("data")
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _source_time(payload: Any) -> int | None:
    if not isinstance(payload, dict):
        return None
    request = payload.get("request")
    if isinstance(request, dict):
        timestamp = _int_or_none(request.get("timestamp") or request.get("time"))
        if timestamp is not None:
            return timestamp
    return _int_or_none(payload.get("timestamp") or payload.get("time"))


def _parse_aircraft(row: dict[str, Any]) -> Aircraft | None:
    latitude = _float_or_none(row.get("lat") or row.get("latitude"))
    longitude = _float_or_none(row.get("lng") or row.get("lon") or row.get("longitude"))
    icao24 = row.get("hex") or row.get("icao24") or row.get("aircraft_icao") or row.get("reg_number")
    if not icao24 or latitude is None or longitude is None:
        return None

    altitude_m = _float_or_none(row.get("alt") or row.get("altitude"))
    speed_kmh = _float_or_none(row.get("speed") or row.get("ground_speed"))
    vertical_rate_mps = _float_or_none(row.get("v_speed") or row.get("vertical_speed"))
    callsign = row.get("flight_icao") or row.get("flight_iata") or row.get("flight_number") or row.get("callsign")
    origin_iata = row.get("dep_iata") or row.get("departure_iata") or row.get("origin_iata")
    origin_icao = row.get("dep_icao") or row.get("departure_icao") or row.get("origin_icao")
    destination_iata = row.get("arr_iata") or row.get("arrival_iata") or row.get("destination_iata")
    destination_icao = row.get("arr_icao") or row.get("arrival_icao") or row.get("destination_icao")

    # Look up airport coords once per airport — result is reused for both lat and
    # lon fields, and the lru_cache means repeated IATA codes across the batch
    # (e.g. many flights from JFK) hit the cache instead of the dict each time.
    _o_iata = str(origin_iata).upper() if origin_iata else None
    _d_iata = str(destination_iata).upper() if destination_iata else None
    _o_coords = _airport_coords_cached(_o_iata) if _o_iata else None
    _d_coords = _airport_coords_cached(_d_iata) if _d_iata else None

    return Aircraft(
        icao24=str(icao24).lower(),
        callsign=str(callsign).strip() if callsign else None,
        latitude=latitude,
        longitude=longitude,
        altitude_m=altitude_m,
        altitude_ft=round(altitude_m * 3.28084) if altitude_m is not None else None,
        velocity_mps=round(speed_kmh / 3.6, 2) if speed_kmh is not None else None,
        velocity_kts=round(speed_kmh / 1.852) if speed_kmh is not None else None,
        heading=_float_or_none(row.get("dir") or row.get("heading")),
        vertical_rate_mps=vertical_rate_mps,
        vertical_rate_fpm=round(vertical_rate_mps * 196.85) if vertical_rate_mps is not None else None,
        country=row.get("flag") or row.get("country"),
        on_ground=str(row.get("status") or "").lower() in {"landed", "ground", "scheduled"},
        origin_iata=_o_iata,
        origin_icao=str(origin_icao).upper() if origin_icao else None,
        origin_name=row.get("dep_name") or row.get("departure_name") or row.get("origin_name"),
        origin_latitude=_float_or_none(
            row.get("dep_lat") or row.get("departure_lat") or row.get("origin_latitude")
        ) or (_o_coords[0] if _o_coords else None),
        origin_longitude=_float_or_none(
            row.get("dep_lng") or row.get("dep_lon") or row.get("departure_lng") or row.get("origin_longitude")
        ) or (_o_coords[1] if _o_coords else None),
        destination_iata=_d_iata,
        destination_icao=str(destination_icao).upper() if destination_icao else None,
        destination_name=row.get("arr_name") or row.get("arrival_name") or row.get("destination_name"),
        destination_latitude=_float_or_none(
            row.get("arr_lat") or row.get("arrival_lat") or row.get("destination_latitude")
        ) or (_d_coords[0] if _d_coords else None),
        destination_longitude=_float_or_none(
            row.get("arr_lng") or row.get("arr_lon") or row.get("arrival_lng") or row.get("destination_longitude")
        ) or (_d_coords[1] if _d_coords else None),
    )


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None
