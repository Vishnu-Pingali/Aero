from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/config")
async def health_config(request: Request) -> dict[str, object]:
    settings = request.app.state.settings
    return {
        "status": "ok",
        "environment": settings.environment,
        "opensky_auth_enabled": settings.opensky_auth_enabled,
        "opensky_timeout_seconds": settings.opensky_timeout_seconds,
        "default_bbox": settings.default_bbox,
        "demo_fallback_enabled": settings.demo_fallback_enabled,
    }
