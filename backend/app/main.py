import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.cache.manager import CacheManager
from app.config import get_settings
from app.routes import flights, health, weather
from app.services.airlabs import AirLabsService
from app.services.scheduler import FlightScheduler, SSEBroadcaster
from app.services.weather import WeatherService
from app.utils.logging import configure_logging


settings = get_settings()
configure_logging(settings)

# ─── Data directory for JSON persistence ──────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
FLIGHTS_CACHE_PATH = DATA_DIR / "flights_cache.json"
AIRCRAFT_CACHE_PATH = DATA_DIR / "aircraft_cache.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeout = httpx.Timeout(
        connect=10.0,
        read=max(settings.airlabs_timeout_seconds, settings.weather_timeout_seconds),
        write=10.0,
        pool=10.0,
    )
    limits = httpx.Limits(max_connections=50, max_keepalive_connections=20)
    client = httpx.AsyncClient(timeout=timeout, limits=limits, headers={"User-Agent": settings.user_agent})
    cache = CacheManager()

    # SSE broadcaster — shared across all request handlers
    broadcaster = SSEBroadcaster()

    app.state.http_client = client
    app.state.cache = cache
    app.state.settings = settings
    app.state.flights_cache_path = FLIGHTS_CACHE_PATH
    app.state.aircraft_cache_path = AIRCRAFT_CACHE_PATH
    app.state.sse_broadcaster = broadcaster
    app.state.airlabs_service = AirLabsService(settings, client, cache)
    app.state.weather_service = WeatherService(settings, client, cache)

    # Start background flight scheduler
    scheduler = FlightScheduler(
        airlabs_service=app.state.airlabs_service,
        cache_path=FLIGHTS_CACHE_PATH,
        interval_seconds=settings.airlabs_cache_ttl_seconds,  # 600 s
        broadcaster=broadcaster,
    )
    scheduler_task = asyncio.create_task(scheduler.run(), name="flight-scheduler")

    try:
        yield
    finally:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
        await client.aclose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(flights.router)
app.include_router(weather.router)

frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
if frontend_dir.exists():
    app.mount("/frontend", StaticFiles(directory=frontend_dir), name="frontend")


@app.get("/", tags=["health"])
async def root() -> dict[str, object]:
    return {
        "status": "ok",
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "endpoints": {
            "flights": "/api/flights",
            "region": "/api/flights/region?lamin=33&lomin=-119&lamax=35&lomax=-117",
            "altitude": "/api/flights/altitude?min_alt=10000&max_alt=40000",
            "stream": "/api/flights/stream",
            "sigmets": "/api/weather/sigmets",
        },
    }


@app.get("/dashboard", include_in_schema=False)
async def dashboard() -> JSONResponse:
    return JSONResponse({"message": "Use the Vite dev server at http://localhost:5173 for the React frontend."})


@app.exception_handler(httpx.TimeoutException)
async def timeout_handler(_: Request, __: httpx.TimeoutException) -> JSONResponse:
    return JSONResponse(status_code=504, content={"detail": "Upstream aviation data provider timed out."})


@app.exception_handler(httpx.TransportError)
async def transport_handler(_: Request, __: httpx.TransportError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": "Unable to reach upstream aviation data provider."})
