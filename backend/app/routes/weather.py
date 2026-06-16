from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.models.weather import MetarResponse, SigmetResponse
from app.services.weather import WeatherService

router = APIRouter(prefix="/api/weather", tags=["weather"])


def get_weather_service(request: Request) -> WeatherService:
    return request.app.state.weather_service


@router.get("/sigmets", response_model=SigmetResponse)
async def sigmets(service: Annotated[WeatherService, Depends(get_weather_service)]) -> SigmetResponse:
    return await service.get_sigmets()


@router.get("/metars", response_model=MetarResponse)
async def metars(
    service: Annotated[WeatherService, Depends(get_weather_service)],
    ids: Annotated[str, Query(description="Comma-separated ICAO station IDs")] = "KJFK,KLAX,KORD,KATL,KDFW,KDEN,KSFO,KMIA",
) -> MetarResponse:
    return await service.get_metars(ids.split(","))
