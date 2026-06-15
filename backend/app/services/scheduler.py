"""
Background scheduler that fetches flight data from AirLabs every 10 minutes,
persists it to flights_cache.json, and broadcasts an SSE refresh event to all
connected browser clients.

Usage (in main.py lifespan):

    from app.services.scheduler import FlightScheduler
    scheduler = FlightScheduler(airlabs_service, settings, sse_broadcaster)
    task = asyncio.create_task(scheduler.run())
    ...
    task.cancel()
"""

import asyncio
import datetime
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from app.utils.json_store import write_json

if TYPE_CHECKING:
    from app.services.airlabs import AirLabsService
    from app.config import Settings

logger = logging.getLogger(__name__)


class SSEBroadcaster:
    """Manages a set of per-client asyncio Queues for Server-Sent Events."""

    def __init__(self) -> None:
        self._clients: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        async with self._lock:
            self._clients.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._clients.discard(q)

    async def broadcast(self, message: str) -> None:
        """Push *message* to every connected client queue (non-blocking)."""
        async with self._lock:
            dead: set[asyncio.Queue] = set()
            for q in self._clients:
                try:
                    q.put_nowait(message)
                except asyncio.QueueFull:
                    dead.add(q)
            self._clients -= dead
        if dead:
            logger.debug("SSE: dropped %d slow/full client queue(s)", len(dead))

    @property
    def client_count(self) -> int:
        return len(self._clients)


class FlightScheduler:
    """Periodically fetches default-region flights and writes to JSON."""

    def __init__(
        self,
        airlabs_service: "AirLabsService",
        cache_path: Path,
        interval_seconds: int,
        broadcaster: SSEBroadcaster,
    ) -> None:
        self._service = airlabs_service
        self._cache_path = cache_path
        self._interval = interval_seconds
        self._broadcaster = broadcaster

    async def run(self) -> None:
        logger.info(
            "FlightScheduler started — interval=%ds, cache=%s",
            self._interval,
            self._cache_path,
        )
        while True:
            await self._tick()
            await asyncio.sleep(self._interval)

    async def _tick(self) -> None:
        fetched_at = datetime.datetime.utcnow().isoformat() + "Z"
        logger.info("FlightScheduler: fetching default-region flights…")
        try:
            response = await self._service.get_default_flights()
            payload = {
                "fetched_at": fetched_at,
                "count": response.count,
                "bbox": list(response.bbox),
                "source_time": response.source_time,
                "flights": [f.model_dump() for f in response.flights],
            }
            await write_json(self._cache_path, payload)
            logger.info(
                "FlightScheduler: wrote %d flights to %s",
                response.count,
                self._cache_path,
            )

            # Broadcast SSE refresh event to all connected browsers
            import json
            msg = json.dumps(
                {
                    "type": "refresh",
                    "count": response.count,
                    "fetched_at": fetched_at,
                },
                separators=(",", ":"),
            )
            await self._broadcaster.broadcast(f"data: {msg}\n\n")

        except Exception as exc:
            logger.error("FlightScheduler tick failed: %s", exc, exc_info=True)
