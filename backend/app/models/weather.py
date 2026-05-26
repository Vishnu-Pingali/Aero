from typing import Any

from pydantic import BaseModel, Field


class SigmetFeature(BaseModel):
    id: str | None = None
    type: str | None = None
    severity: str | None = None
    raw_text: str | None = None
    geometry: dict[str, Any] | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class SigmetResponse(BaseModel):
    source: str = "aviationweather.gov"
    count: int
    geojson: dict[str, Any]
    sigmets: list[SigmetFeature] = Field(default_factory=list)


class MetarObservation(BaseModel):
    station: str
    observed: str | None = None
    raw_text: str | None = None
    flight_category: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    temperature_c: float | None = None
    dewpoint_c: float | None = None
    wind_direction_deg: int | None = None
    wind_speed_kt: int | None = None
    wind_gust_kt: int | None = None
    visibility_sm: float | None = None
    altimeter_in_hg: float | None = None
    clouds: list[dict[str, Any]] = Field(default_factory=list)


class MetarResponse(BaseModel):
    source: str = "aviationweather.gov"
    count: int
    observations: list[MetarObservation] = Field(default_factory=list)
