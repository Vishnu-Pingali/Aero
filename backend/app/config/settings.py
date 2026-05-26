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


@dataclass
class Settings:
    app_name: str = "Aero Ops Intelligence API"
    app_version: str = "1.0.0"
    environment: str = os.getenv("ENVIRONMENT", "development")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    opensky_credentials_path: Path = Path(
        os.getenv("OPENSKY_CREDENTIALS_PATH", str(BACKEND_DIR / "credentials" / "credentials.json"))
    )
    opensky_fallback_credentials_path: Path = REPO_DIR / "credentials.json"
    opensky_client_id: str | None = os.getenv("OPENSKY_CLIENT_ID")
    opensky_client_secret: str | None = os.getenv("OPENSKY_CLIENT_SECRET")
    opensky_auth_enabled: bool = os.getenv("OPENSKY_AUTH_ENABLED", "true").lower() == "true"
    opensky_token_url: str = (
        "https://auth.opensky-network.org/auth/realms/opensky-network/"
        "protocol/openid-connect/token"
    )
    opensky_states_url: str = "https://opensky-network.org/api/states/all"
    opensky_timeout_seconds: float = float(os.getenv("OPENSKY_TIMEOUT_SECONDS", "30.0"))
    opensky_cache_ttl_seconds: int = int(os.getenv("OPENSKY_CACHE_TTL_SECONDS", "4"))
    opensky_min_request_interval_seconds: float = float(os.getenv("OPENSKY_MIN_REQUEST_INTERVAL_SECONDS", "1.0"))
    opensky_token_refresh_margin_seconds: int = 60

    weather_sigmet_url: str = "https://aviationweather.gov/api/data/airsigmet"
    weather_metar_url: str = "https://aviationweather.gov/api/data/metar"
    weather_cache_ttl_seconds: int = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "60"))
    weather_timeout_seconds: float = float(os.getenv("WEATHER_TIMEOUT_SECONDS", "20.0"))
    user_agent: str = "Aero-Ops-Intelligence/1.0 contact=local"

    default_lamin: float = 6.0
    default_lomin: float = 68.0
    default_lamax: float = 37.5
    default_lomax: float = 97.5
    max_bbox_area_degrees: float = 2500.0
    max_aircraft_returned: int = 5000

    cors_origins: Sequence[str] = Field(default_factory=lambda: _cors_origins())

    @field_validator("opensky_credentials_path", "opensky_fallback_credentials_path")
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
