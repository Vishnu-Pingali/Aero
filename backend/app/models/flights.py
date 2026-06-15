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
    origin_iata: str | None = None
    origin_icao: str | None = None
    origin_name: str | None = None
    origin_latitude: float | None = None
    origin_longitude: float | None = None
    destination_iata: str | None = None
    destination_icao: str | None = None
    destination_name: str | None = None
    destination_latitude: float | None = None
    destination_longitude: float | None = None


class FlightsResponse(BaseModel):
    source: str = "airlabs"
    source_time: int | None = None
    fetched_at: str | None = None   # ISO timestamp of last backend scheduler refresh
    count: int
    bbox: tuple[float, float, float, float]
    flights: list[Aircraft] = Field(default_factory=list)


class RoutePoint(BaseModel):
    type: str
    label: str
    latitude: float
    longitude: float


class AircraftRoute(BaseModel):
    aircraft: Aircraft
    points: list[RoutePoint]
