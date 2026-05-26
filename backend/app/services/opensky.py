import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.auth.opensky import OpenSkyAuth
from app.cache.manager import CacheManager
from app.config import Settings
from app.models.flights import Aircraft, FlightsResponse
from app.utils.bbox import normalize_bbox

logger = logging.getLogger(__name__)


class OpenSkyService:
    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient,
        auth: OpenSkyAuth,
        cache: CacheManager,
    ) -> None:
        self._settings = settings
        self._client = client
        self._auth = auth
        self._cache = cache
        self._request_lock = asyncio.Lock()
        self._snapshot_lock = asyncio.Lock()
        self._snapshot: FlightsResponse | None = None
        self._snapshot_updated_at = 0.0
        self._last_request_at = 0.0

    async def get_default_flights(self) -> FlightsResponse:
        return await self.get_india_snapshot()

    async def get_region_flights(self, lamin: float, lomin: float, lamax: float, lomax: float) -> FlightsResponse:
        bbox = _clamp_to_default_bbox((lamin, lomin, lamax, lomax), self._settings.default_bbox)
        bbox = normalize_bbox(*bbox, self._settings.max_bbox_area_degrees)
        key = f"opensky:states:{bbox}"
        return await self._cache.get_or_set(
            key,
            self._settings.opensky_cache_ttl_seconds,
            lambda: self._fetch_states(bbox),
        )

    async def get_altitude_filtered(
        self,
        min_alt: int | None,
        max_alt: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> FlightsResponse:
        if min_alt is not None and max_alt is not None and min_alt > max_alt:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "min_alt must be less than max_alt.")
        response = await self.get_india_snapshot() if bbox is None else await self.get_region_flights(*bbox)
        flights = [
            flight
            for flight in response.flights
            if flight.altitude_ft is not None
            and (min_alt is None or flight.altitude_ft >= min_alt)
            and (max_alt is None or flight.altitude_ft <= max_alt)
        ]
        return response.model_copy(update={"count": len(flights), "flights": flights})

    async def get_india_snapshot(self) -> FlightsResponse:
        if self._snapshot and not self._snapshot_is_stale():
            return self._snapshot
        async with self._snapshot_lock:
            if self._snapshot and not self._snapshot_is_stale():
                return self._snapshot
            await self.refresh_india_snapshot()
            if self._snapshot:
                return self._snapshot
        return FlightsResponse(source_time=None, count=0, bbox=self._settings.default_bbox, flights=[])

    async def probe_live_data(self) -> dict[str, object]:
        started = time.monotonic()
        bbox = (18.0, 72.0, 20.0, 74.0)
        try:
            response = await self._fetch_states(bbox)
            return {
                "ok": True,
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "bbox": bbox,
                "count": response.count,
                "source_time": response.source_time,
                "auth_enabled": self._settings.opensky_auth_enabled,
            }
        except Exception as exc:
            logger.exception("OpenSky live probe failed")
            return {
                "ok": False,
                "elapsed_seconds": round(time.monotonic() - started, 3),
                "bbox": bbox,
                "error_type": type(exc).__name__,
                "error": str(exc),
                "auth_enabled": self._settings.opensky_auth_enabled,
            }

    async def refresh_india_snapshot(self) -> None:
        tiles = _india_tiles()
        results = await asyncio.gather(
            *(self._fetch_tile(tile) for tile in tiles),
            return_exceptions=True,
        )
        by_icao: dict[str, Aircraft] = {}
        source_time = None
        for result in results:
            if isinstance(result, Exception):
                logger.warning("India tile refresh failed: %s", result)
                continue
            source_time = max(source_time or 0, result.source_time or 0) or source_time
            for aircraft in result.flights:
                by_icao[aircraft.icao24] = aircraft

        if by_icao:
            flights = list(by_icao.values())[: self._settings.max_aircraft_returned]
            self._snapshot = FlightsResponse(
                source_time=source_time,
                count=len(flights),
                bbox=self._settings.default_bbox,
                flights=flights,
            )
            self._snapshot_updated_at = time.monotonic()
            await self._cache.cache.set("opensky:india:snapshot", self._snapshot, ttl=120)
            logger.info("India flight snapshot refreshed: %s aircraft", len(flights))
        elif self._snapshot is None:
            cached = await self._cache.cache.get("opensky:india:snapshot")
            if cached is not None:
                self._snapshot = cached
                self._snapshot_updated_at = time.monotonic()
            elif self._settings.demo_fallback_enabled:
                flights = _demo_india_aircraft()
                self._snapshot = FlightsResponse(
                    source_time=None,
                    count=len(flights),
                    bbox=self._settings.default_bbox,
                    flights=flights,
                )
                self._snapshot_updated_at = time.monotonic()
                logger.warning("Using demo India aircraft fallback because OpenSky returned no live tiles")

    async def snapshot_loop(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=self._settings.india_snapshot_refresh_seconds)
                break
            except TimeoutError:
                pass
            try:
                await self.refresh_india_snapshot()
            except Exception:
                logger.exception("India flight snapshot refresh failed")

    def _snapshot_is_stale(self) -> bool:
        return time.monotonic() - self._snapshot_updated_at > self._settings.india_snapshot_refresh_seconds

    async def _fetch_states(self, bbox: tuple[float, float, float, float]) -> FlightsResponse:
        await self._respect_min_interval()
        params = {"lamin": bbox[0], "lomin": bbox[1], "lamax": bbox[2], "lomax": bbox[3]}
        response = await self._request_states_with_fallback(params)

        if response.status_code == 429:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "OpenSky rate limit reached; retry shortly.")
        if response.status_code >= 500:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "OpenSky service is temporarily unavailable.")
        if response.status_code >= 400:
            logger.warning("OpenSky states request failed: %s %s", response.status_code, response.text[:200])
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "OpenSky states request failed.")

        payload = response.json()
        states = payload.get("states") or []
        flights = [aircraft for row in states if (aircraft := _parse_aircraft(row)) is not None]
        flights = flights[: self._settings.max_aircraft_returned]
        return FlightsResponse(source_time=payload.get("time"), count=len(flights), bbox=bbox, flights=flights)

    async def _request_states(self, params: dict[str, float]) -> httpx.Response:
        headers = {}
        try:
            token = await self._auth.bearer_token()
            headers = {"Authorization": f"Bearer {token}"}
        except HTTPException as exc:
            logger.info("OpenSky auth skipped: %s", exc.detail)
        except (httpx.TimeoutException, httpx.TransportError):
            logger.warning("OpenSky auth failed; retrying states request without bearer token")

        try:
            return await self._client.get(self._settings.opensky_states_url, params=params, headers=headers)
        except httpx.TimeoutException:
            if not headers:
                raise
            logger.warning("OpenSky authenticated states request timed out; retrying without bearer token")
            return await self._client.get(self._settings.opensky_states_url, params=params)

    async def _fetch_tile(self, bbox: tuple[float, float, float, float]) -> FlightsResponse:
        try:
            return await asyncio.wait_for(self._fetch_states(bbox), timeout=self._settings.india_tile_timeout_seconds)
        except TimeoutError as exc:
            raise httpx.TimeoutException("OpenSky tile timed out") from exc

    async def _request_states_with_fallback(self, params: dict[str, float]) -> httpx.Response:
        try:
            return await self._request_states(params)
        except httpx.TimeoutException:
            fallback = _fallback_bbox(params)
            if fallback == params:
                raise
            logger.warning("OpenSky request timed out; retrying compact India fallback bbox")
            return await self._request_states(fallback)

    async def _respect_min_interval(self) -> None:
        async with self._request_lock:
            elapsed = time.monotonic() - self._last_request_at
            wait_for = self._settings.opensky_min_request_interval_seconds - elapsed
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_request_at = time.monotonic()


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


def _fallback_bbox(params: dict[str, float]) -> dict[str, float]:
    area = (params["lamax"] - params["lamin"]) * (params["lomax"] - params["lomin"])
    if area <= 180:
        return params
    return {"lamin": 17.0, "lomin": 72.0, "lamax": 29.5, "lomax": 81.0}


def _india_tiles() -> list[tuple[float, float, float, float]]:
    return [
        (6.0, 68.0, 17.0, 78.0),
        (6.0, 78.0, 17.0, 88.0),
        (6.0, 88.0, 17.0, 97.5),
        (17.0, 68.0, 27.0, 78.0),
        (17.0, 78.0, 27.0, 88.0),
        (17.0, 88.0, 27.0, 97.5),
        (27.0, 68.0, 37.5, 78.0),
        (27.0, 78.0, 37.5, 88.0),
        (27.0, 88.0, 37.5, 97.5),
    ]


def _demo_india_aircraft() -> list[Aircraft]:
    return [
        Aircraft(
            icao24="demo001",
            callsign="AIC101",
            latitude=28.5562,
            longitude=77.1,
            altitude_m=10668,
            altitude_ft=35000,
            velocity_mps=236,
            velocity_kts=459,
            heading=245,
            vertical_rate_mps=0,
            vertical_rate_fpm=0,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo002",
            callsign="IGO742",
            latitude=19.0896,
            longitude=72.8656,
            altitude_m=9144,
            altitude_ft=30000,
            velocity_mps=221,
            velocity_kts=430,
            heading=132,
            vertical_rate_mps=1.5,
            vertical_rate_fpm=295,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo003",
            callsign="VTI895",
            latitude=13.1986,
            longitude=77.7066,
            altitude_m=11582,
            altitude_ft=38000,
            velocity_mps=244,
            velocity_kts=474,
            heading=318,
            vertical_rate_mps=-0.4,
            vertical_rate_fpm=-79,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo004",
            callsign="AXB612",
            latitude=22.6547,
            longitude=88.4467,
            altitude_m=9754,
            altitude_ft=32000,
            velocity_mps=226,
            velocity_kts=439,
            heading=264,
            vertical_rate_mps=0.2,
            vertical_rate_fpm=39,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo005",
            callsign="IGO528",
            latitude=17.2403,
            longitude=78.4294,
            altitude_m=8534,
            altitude_ft=28000,
            velocity_mps=212,
            velocity_kts=412,
            heading=52,
            vertical_rate_mps=2.1,
            vertical_rate_fpm=413,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo006",
            callsign="AIC430",
            latitude=12.9941,
            longitude=80.1709,
            altitude_m=7010,
            altitude_ft=23000,
            velocity_mps=198,
            velocity_kts=385,
            heading=18,
            vertical_rate_mps=-1.1,
            vertical_rate_fpm=-217,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo007",
            callsign="IGO119",
            latitude=26.7606,
            longitude=80.8893,
            altitude_m=7925,
            altitude_ft=26000,
            velocity_mps=205,
            velocity_kts=398,
            heading=101,
            vertical_rate_mps=0.7,
            vertical_rate_fpm=138,
            country="India",
            on_ground=False,
        ),
        Aircraft(
            icao24="demo008",
            callsign="VTI320",
            latitude=23.0734,
            longitude=72.6266,
            altitude_m=10058,
            altitude_ft=33000,
            velocity_mps=231,
            velocity_kts=449,
            heading=176,
            vertical_rate_mps=-0.6,
            vertical_rate_fpm=-118,
            country="India",
            on_ground=False,
        ),
    ]

def _parse_aircraft(row: list[Any]) -> Aircraft | None:
    if len(row) < 11:
        return None
    longitude = row[5]
    latitude = row[6]
    if latitude is None or longitude is None:
        return None

    altitude_m = row[7] if row[7] is not None else row[13] if len(row) > 13 else None
    velocity_mps = row[9]
    vertical_rate_mps = row[11] if len(row) > 11 else None

    return Aircraft(
        icao24=row[0],
        callsign=row[1].strip() if row[1] else None,
        country=row[2],
        longitude=float(longitude),
        latitude=float(latitude),
        altitude_m=float(altitude_m) if altitude_m is not None else None,
        altitude_ft=round(float(altitude_m) * 3.28084) if altitude_m is not None else None,
        on_ground=bool(row[8]),
        velocity_mps=float(velocity_mps) if velocity_mps is not None else None,
        velocity_kts=round(float(velocity_mps) * 1.94384) if velocity_mps is not None else None,
        heading=float(row[10]) if row[10] is not None else None,
        vertical_rate_mps=float(vertical_rate_mps) if vertical_rate_mps is not None else None,
        vertical_rate_fpm=round(float(vertical_rate_mps) * 196.85) if vertical_rate_mps is not None else None,
    )
