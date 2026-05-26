from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.models.flights import FlightsResponse
from app.services.opensky import OpenSkyService

router = APIRouter(prefix="/api/flights", tags=["flights"])


def get_opensky_service(request: Request) -> OpenSkyService:
    return request.app.state.opensky_service


@router.get("", response_model=FlightsResponse)
async def flights(service: Annotated[OpenSkyService, Depends(get_opensky_service)]) -> FlightsResponse:
    return await service.get_default_flights()


@router.get("/region", response_model=FlightsResponse)
async def flights_region(
    service: Annotated[OpenSkyService, Depends(get_opensky_service)],
    lamin: Annotated[float, Query(ge=-90, le=90)],
    lomin: Annotated[float, Query(ge=-180, le=180)],
    lamax: Annotated[float, Query(ge=-90, le=90)],
    lomax: Annotated[float, Query(ge=-180, le=180)],
) -> FlightsResponse:
    return await service.get_region_flights(lamin, lomin, lamax, lomax)


@router.get("/altitude", response_model=FlightsResponse)
async def flights_altitude(
    service: Annotated[OpenSkyService, Depends(get_opensky_service)],
    min_alt: Annotated[int | None, Query(ge=-2000)] = None,
    max_alt: Annotated[int | None, Query(le=70000)] = None,
    lamin: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lomin: Annotated[float | None, Query(ge=-180, le=180)] = None,
    lamax: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lomax: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> FlightsResponse:
    bbox = None
    values = (lamin, lomin, lamax, lomax)
    if all(value is not None for value in values):
        bbox = (lamin, lomin, lamax, lomax)  # type: ignore[assignment]
    return await service.get_altitude_filtered(min_alt, max_alt, bbox=bbox)
