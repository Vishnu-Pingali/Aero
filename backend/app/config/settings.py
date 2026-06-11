import os
from functools import lru_cache
from pathlib import Path
from typing import Sequence

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic.dataclasses import dataclass


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _env_optional(name: str) -> str | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return None
    return value.strip()


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return Path(value)


@dataclass
class Settings:
    app_name: str = "Aero Ops Intelligence API"
    app_version: str = "1.0.0"
    environment: str = os.getenv("ENVIRONMENT", "production")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    airlabs_credentials_path: Path = _env_path(
        "AIRLABS_CREDENTIALS_PATH",
        BACKEND_DIR / "credentials" / "credentials.json",
    )
    airlabs_fallback_credentials_path: Path = REPO_DIR / "credentials.json"
    airlabs_api_key: str | None = _env_optional("AIRLABS_API_KEY")
    airlabs_base_url: str = os.getenv("AIRLABS_BASE_URL", "https://airlabs.co/api/v9")
    airlabs_timeout_seconds: float = float(os.getenv("AIRLABS_TIMEOUT_SECONDS", "30.0"))
    airlabs_cache_ttl_seconds: int = int(os.getenv("AIRLABS_CACHE_TTL_SECONDS", "600"))
    airlabs_min_request_interval_seconds: float = float(os.getenv("AIRLABS_MIN_REQUEST_INTERVAL_SECONDS", "600.0"))

    weather_sigmet_url: str = "https://aviationweather.gov/api/data/airsigmet"
    weather_metar_url: str = "https://aviationweather.gov/api/data/metar"
    weather_cache_ttl_seconds: int = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "60"))
    weather_timeout_seconds: float = float(os.getenv("WEATHER_TIMEOUT_SECONDS", "20.0"))
    user_agent: str = "Aero-Ops-Intelligence/1.0 contact=local"

    default_lamin: float = 24.0
    default_lomin: float = -125.0
    default_lamax: float = 50.0
    default_lomax: float = -66.0
    max_bbox_area_degrees: float = 2500.0
    max_aircraft_returned: int = 5000

    cors_origins: Sequence[str] = Field(default_factory=lambda: _cors_origins())

    @field_validator("airlabs_credentials_path", "airlabs_fallback_credentials_path")
    @classmethod
    def expand_path(cls, value: Path) -> Path:
        return value.expanduser().resolve()

    @property
    def default_bbox(self) -> tuple[float, float, float, float]:
        return (
            self.default_lamin,
            self.default_lomin,
            self.default_lamax,
            self.default_lomax,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "null",
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

