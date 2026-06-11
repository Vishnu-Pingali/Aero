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
        "airlabs_api_key_configured": request.app.state.airlabs_service.api_key_configured,
        "airlabs_timeout_seconds": settings.airlabs_timeout_seconds,
        "airlabs_cache_ttl_seconds": settings.airlabs_cache_ttl_seconds,
        "default_bbox": settings.default_bbox,
    }


@router.get("/health/airlabs")
async def health_airlabs(request: Request) -> dict[str, object]:
    return await request.app.state.airlabs_service.probe_live_data()
