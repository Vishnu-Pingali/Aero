from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth.opensky import OpenSkyAuth
from app.cache.manager import CacheManager
from app.config import get_settings
from app.routes import flights, health, weather
from app.services.opensky import OpenSkyService
from app.services.weather import WeatherService
from app.utils.logging import configure_logging


settings = get_settings()
configure_logging(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeout = httpx.Timeout(
        connect=10.0,
        read=max(settings.opensky_timeout_seconds, settings.weather_timeout_seconds),
        write=10.0,
        pool=10.0,
    )
    limits = httpx.Limits(max_connections=50, max_keepalive_connections=20)
    client = httpx.AsyncClient(timeout=timeout, limits=limits, headers={"User-Agent": settings.user_agent})
    cache = CacheManager()
    auth = OpenSkyAuth(settings, client)
    app.state.http_client = client
    app.state.cache = cache
    app.state.settings = settings
    app.state.opensky_service = OpenSkyService(settings, client, auth, cache)
    app.state.weather_service = WeatherService(settings, client, cache)
    try:
        yield
    finally:
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
    allow_origin_regex=r"(https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app)",
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
            "sigmets": "/api/weather/sigmets",
        },
    }


@app.get("/dashboard", include_in_schema=False)
async def dashboard() -> FileResponse:
    return FileResponse(frontend_dir / "code.html")


@app.exception_handler(httpx.TimeoutException)
async def timeout_handler(_: Request, __: httpx.TimeoutException) -> JSONResponse:
    return JSONResponse(status_code=504, content={"detail": "Upstream aviation data provider timed out."})


@app.exception_handler(httpx.TransportError)
async def transport_handler(_: Request, __: httpx.TransportError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": "Unable to reach upstream aviation data provider."})
