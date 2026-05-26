import asyncio
import json
import logging
import time
from pathlib import Path

import httpx
from fastapi import HTTPException, status

from app.config import Settings

logger = logging.getLogger(__name__)


class OpenSkyAuth:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self._settings = settings
        self._client = client
        self._access_token: str | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()
        self._client_id: str | None = None
        self._client_secret: str | None = None

    async def bearer_token(self) -> str:
        if self._access_token and not self._token_needs_refresh():
            return self._access_token

        async with self._lock:
            if self._access_token and not self._token_needs_refresh():
                return self._access_token
            await self._refresh()
            return self._access_token or ""

    def _token_needs_refresh(self) -> bool:
        margin = self._settings.opensky_token_refresh_margin_seconds
        return time.time() >= self._expires_at - margin

    async def _refresh(self) -> None:
        client_id, client_secret = self._load_credentials()
        response = await self._client.post(
            self._settings.opensky_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if response.status_code >= 400:
            logger.warning("OpenSky token refresh failed: %s", response.status_code)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "OpenSky authentication failed. Check API client credentials.",
            )

        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "OpenSky token response was missing access_token.")

        self._access_token = token
        self._expires_at = time.time() + int(payload.get("expires_in", 300))
        logger.info("OpenSky access token refreshed")

    def _load_credentials(self) -> tuple[str, str]:
        if self._client_id and self._client_secret:
            return self._client_id, self._client_secret

        if self._settings.opensky_client_id and self._settings.opensky_client_secret:
            self._client_id = self._settings.opensky_client_id
            self._client_secret = self._settings.opensky_client_secret
            return self._client_id, self._client_secret

        credentials_path = self._settings.opensky_credentials_path
        if not credentials_path.exists():
            credentials_path = self._settings.opensky_fallback_credentials_path
        if not credentials_path.exists():
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "OpenSky credentials JSON was not found.")

        credentials = _read_json(credentials_path)
        client_id = credentials.get("clientId") or credentials.get("client_id")
        client_secret = credentials.get("clientSecret") or credentials.get("client_secret")
        if not client_id or not client_secret:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "OpenSky credentials JSON must contain clientId/clientSecret.",
            )

        self._client_id = client_id
        self._client_secret = client_secret
        return client_id, client_secret


def _read_json(path: Path) -> dict[str, str]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "OpenSky credentials JSON is invalid.") from exc
