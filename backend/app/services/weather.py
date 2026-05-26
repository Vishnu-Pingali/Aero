import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import HTTPException

from app.cache.manager import CacheManager
from app.config import Settings
from app.models.weather import MetarObservation, MetarResponse, SigmetFeature, SigmetResponse

logger = logging.getLogger(__name__)


class WeatherService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, cache: CacheManager) -> None:
        self._settings = settings
        self._client = client
        self._cache = cache

    async def get_sigmets(self) -> SigmetResponse:
        return await self._cache.get_or_set(
            "weather:sigmets",
            self._settings.weather_cache_ttl_seconds,
            self._fetch_sigmets,
        )

    async def get_metars(self, ids: list[str]) -> MetarResponse:
        station_ids = _normalize_station_ids(ids)
        key = f"weather:metars:{','.join(station_ids)}"
        return await self._cache.get_or_set(
            key,
            self._settings.weather_cache_ttl_seconds,
            lambda: self._fetch_metars(station_ids),
        )

    async def _fetch_sigmets(self) -> SigmetResponse:
        response = await self._client.get(
            self._settings.weather_sigmet_url,
            params={"format": "geojson"},
            headers={"User-Agent": self._settings.user_agent, "Accept": "application/geo+json, application/json"},
        )
        if response.status_code == 204:
            geojson = {"type": "FeatureCollection", "features": []}
            return SigmetResponse(count=0, geojson=geojson, sigmets=[])
        if response.status_code == 429:
            raise HTTPException(429, "AviationWeather rate limit reached; retry shortly.")
        if response.status_code >= 400:
            logger.warning("AviationWeather SIGMET request failed: %s", response.status_code)
            raise HTTPException(502, "AviationWeather SIGMET request failed.")

        geojson = response.json()
        features = geojson.get("features") or []
        sigmets = [_parse_sigmet(feature) for feature in features]
        return SigmetResponse(count=len(sigmets), geojson=geojson, sigmets=sigmets)

    async def _fetch_metars(self, ids: list[str]) -> MetarResponse:
        response = await self._client.get(
            self._settings.weather_metar_url,
            params={"ids": ",".join(ids), "format": "json"},
            headers={"User-Agent": self._settings.user_agent, "Accept": "application/json"},
        )
        if response.status_code == 204:
            return MetarResponse(count=0, observations=[])
        if response.status_code == 429:
            raise HTTPException(429, "AviationWeather rate limit reached; retry shortly.")
        if response.status_code >= 400:
            logger.warning("AviationWeather METAR request failed: %s", response.status_code)
            raise HTTPException(502, "AviationWeather METAR request failed.")

        payload = response.json()
        rows = payload if isinstance(payload, list) else payload.get("data", [])
        observations = [_parse_metar(row) for row in rows if isinstance(row, dict)]
        return MetarResponse(count=len(observations), observations=observations)


def _parse_sigmet(feature: dict[str, Any]) -> SigmetFeature:
    properties = feature.get("properties") or {}
    sigmet_type = (
        properties.get("hazard")
        or properties.get("hazardType")
        or properties.get("type")
        or properties.get("airSigmetType")
    )
    raw_text = properties.get("rawText") or properties.get("raw_text") or properties.get("text")
    severity = _infer_severity(sigmet_type, raw_text or "")
    return SigmetFeature(
        id=properties.get("id") or properties.get("airSigmetId") or feature.get("id"),
        type=sigmet_type,
        severity=severity,
        raw_text=raw_text,
        geometry=feature.get("geometry"),
        properties=properties,
    )


def _parse_metar(row: dict[str, Any]) -> MetarObservation:
    return MetarObservation(
        station=row.get("icaoId") or row.get("station_id") or row.get("id") or "UNKNOWN",
        observed=_observed_time(row.get("obsTime") or row.get("observation_time") or row.get("reportTime")),
        raw_text=row.get("rawOb") or row.get("raw_text") or row.get("raw"),
        flight_category=row.get("fltCat") or row.get("flight_category"),
        latitude=_float_or_none(row.get("lat") or row.get("latitude")),
        longitude=_float_or_none(row.get("lon") or row.get("longitude")),
        temperature_c=_float_or_none(row.get("temp") or row.get("temp_c")),
        dewpoint_c=_float_or_none(row.get("dewp") or row.get("dewpoint_c")),
        wind_direction_deg=_int_or_none(row.get("wdir") or row.get("wind_dir_degrees")),
        wind_speed_kt=_int_or_none(row.get("wspd") or row.get("wind_speed_kt")),
        wind_gust_kt=_int_or_none(row.get("wgst") or row.get("wind_gust_kt")),
        visibility_sm=_float_or_none(row.get("visib") or row.get("visibility_statute_mi")),
        altimeter_in_hg=_altimeter_in_hg(row.get("altim") or row.get("altim_in_hg")),
        clouds=row.get("clouds") if isinstance(row.get("clouds"), list) else [],
    )


def _normalize_station_ids(ids: list[str]) -> list[str]:
    station_ids = []
    for station_id in ids:
        cleaned = station_id.strip().upper()
        if cleaned and cleaned.isalnum() and 3 <= len(cleaned) <= 4:
            station_ids.append(cleaned)
    unique = list(dict.fromkeys(station_ids))
    if not unique:
        unique = ["VIDP", "VABB", "VOBL", "VOMM", "VOHS", "VECC", "VAAH"]
    return unique[:12]


def _float_or_none(value: Any) -> float | None:
    if isinstance(value, str) and value.endswith("+"):
        value = value[:-1]
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _observed_time(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, tz=UTC).isoformat()
    return str(value)


def _altimeter_in_hg(value: Any) -> float | None:
    altimeter = _float_or_none(value)
    if altimeter is None:
        return None
    if altimeter > 100:
        return round(altimeter * 0.0295299830714, 2)
    return altimeter


def _infer_severity(sigmet_type: str | None, raw_text: str) -> str:
    value = f"{sigmet_type or ''} {raw_text}".upper()
    if "EXTREME" in value:
        return "extreme"
    if "SEV" in value or "CONV" in value or "VOLCANIC" in value or "ASH" in value:
        return "severe"
    if "MOD" in value:
        return "moderate"
    return "advisory"
