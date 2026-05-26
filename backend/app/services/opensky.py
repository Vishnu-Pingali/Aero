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
        self._last_request_at = 0.0

    async def get_default_flights(self) -> FlightsResponse:
        return await self.get_region_flights(*self._settings.default_bbox)

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
        response = await self.get_region_flights(*(bbox or self._settings.default_bbox))
        flights = [
            flight
            for flight in response.flights
            if flight.altitude_ft is not None
            and (min_alt is None or flight.altitude_ft >= min_alt)
            and (max_alt is None or flight.altitude_ft <= max_alt)
        ]
        return response.model_copy(update={"count": len(flights), "flights": flights})

    async def _fetch_states(self, bbox: tuple[float, float, float, float]) -> FlightsResponse:
        await self._respect_min_interval()
        params = {"lamin": bbox[0], "lomin": bbox[1], "lamax": bbox[2], "lomax": bbox[3]}
        response = await self._request_states(params)

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
