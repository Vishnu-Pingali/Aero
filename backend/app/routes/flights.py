import asyncio
import datetime
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.models.flights import Aircraft, AircraftRoute, FlightsResponse
from app.services.airlabs import AirLabsService
from app.utils.json_store import read_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/flights", tags=["flights"])

# How old the JSON cache can be before we fall back to a live fetch (seconds)
CACHE_MAX_AGE_SECONDS = 660  # 10 min + 60 s grace


def get_airlabs_service(request: Request) -> AirLabsService:
    return request.app.state.airlabs_service


# ─── Helper: read flights from JSON cache ─────────────────────────────────────

async def _flights_from_cache(request: Request) -> FlightsResponse | None:
    """Return a FlightsResponse from flights_cache.json if it is fresh enough."""
    cache_path = request.app.state.flights_cache_path
    data = await read_json(cache_path)
    if not isinstance(data, dict):
        return None

    # Check freshness
    fetched_at_str = data.get("fetched_at")
    if fetched_at_str:
        try:
            fetched_at = datetime.datetime.fromisoformat(fetched_at_str.rstrip("Z"))
            age = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - fetched_at).total_seconds()
            if age > CACHE_MAX_AGE_SECONDS:
                logger.info("flights_cache.json is %.0f s old — bypassing cache", age)
                return None
        except ValueError:
            pass

    try:
        from app.models.flights import Aircraft as AircraftModel
        flights = [AircraftModel(**f) for f in (data.get("flights") or [])]
        return FlightsResponse(
            source="json_cache",
            source_time=data.get("source_time"),
            fetched_at=data.get("fetched_at"),
            count=len(flights),
            bbox=tuple(data.get("bbox", [24, -125, 50, -66])),
            flights=flights,
        )
    except Exception as exc:
        logger.warning("Failed to deserialise flights_cache.json: %s", exc)
        return None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=FlightsResponse)
async def flights(
    request: Request,
    service: Annotated[AirLabsService, Depends(get_airlabs_service)],
) -> FlightsResponse:
    cached = await _flights_from_cache(request)
    if cached is not None:
        return cached
    return await service.get_default_flights()


@router.get("/region", response_model=FlightsResponse)
async def flights_region(
    request: Request,
    service: Annotated[AirLabsService, Depends(get_airlabs_service)],
    lamin: Annotated[float, Query(ge=-90, le=90)],
    lomin: Annotated[float, Query(ge=-180, le=180)],
    lamax: Annotated[float, Query(ge=-90, le=90)],
    lomax: Annotated[float, Query(ge=-180, le=180)],
) -> FlightsResponse:
    # Serve from JSON cache first; the cache stores the full default US bbox.
    # Client-side filtering is already done by the frontend, so returning the
    # full cached set is safe and avoids redundant AirLabs calls.
    cached = await _flights_from_cache(request)
    if cached is not None:
        return cached
    return await service.get_region_flights(lamin, lomin, lamax, lomax)


@router.get("/aircraft/{icao24}", response_model=Aircraft)
async def aircraft(
    service: Annotated[AirLabsService, Depends(get_airlabs_service)],
    request: Request,
    icao24: str,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> Aircraft:
    aircraft_cache_path = request.app.state.aircraft_cache_path
    return await service.get_aircraft_near(
        icao24, latitude, longitude, aircraft_cache_path=aircraft_cache_path
    )


@router.get("/aircraft/{icao24}/route", response_model=AircraftRoute)
async def aircraft_route(
    service: Annotated[AirLabsService, Depends(get_airlabs_service)],
    request: Request,
    icao24: str,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> AircraftRoute:
    aircraft_cache_path = request.app.state.aircraft_cache_path
    return await service.get_aircraft_route(
        icao24, latitude, longitude, aircraft_cache_path=aircraft_cache_path
    )


@router.get("/altitude", response_model=FlightsResponse)
async def flights_altitude(
    service: Annotated[AirLabsService, Depends(get_airlabs_service)],
    request: Request,
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


# ─── SSE Stream ───────────────────────────────────────────────────────────────

@router.get("/stream")
async def flights_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events endpoint.

    Clients connect once and receive a ``data: {...}`` JSON message whenever
    the backend scheduler refreshes the flight data (every 10 minutes).
    A ``data: {"type":"ping"}`` keep-alive comment is sent every 15 seconds
    to prevent proxy / Render.com from closing the idle connection.
    """
    broadcaster = request.app.state.sse_broadcaster
    queue: asyncio.Queue = await broadcaster.subscribe()
    logger.debug("SSE: client connected (total=%d)", broadcaster.client_count)

    async def event_generator():
        # Send an immediate "connected" event so the client knows it's live
        connected_msg = json.dumps({"type": "connected"}, separators=(",", ":"))
        yield f"data: {connected_msg}\n\n"

        ping_msg = 'data: {"type":"ping"}\n\n'
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # Wait up to 15 s; if nothing arrives send a keep-alive ping
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield message
                except asyncio.TimeoutError:
                    yield ping_msg
        except asyncio.CancelledError:
            pass
        finally:
            await broadcaster.unsubscribe(queue)
            logger.debug("SSE: client disconnected (total=%d)", broadcaster.client_count)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering on Render
            "Connection": "keep-alive",
        },
    )
