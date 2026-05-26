from pydantic import BaseModel, Field


class Aircraft(BaseModel):
    icao24: str
    callsign: str | None = None
    latitude: float
    longitude: float
    altitude_m: float | None = None
    altitude_ft: int | None = None
    velocity_mps: float | None = None
    velocity_kts: int | None = None
    heading: float | None = None
    vertical_rate_mps: float | None = None
    vertical_rate_fpm: int | None = None
    country: str | None = None
    on_ground: bool = False


class FlightsResponse(BaseModel):
    source: str = "opensky"
    source_time: int | None = None
    count: int
    bbox: tuple[float, float, float, float]
    flights: list[Aircraft] = Field(default_factory=list)
