"""
Atomic JSON read/write helpers for the on-disk flight data cache.

All writes use a write-then-rename pattern to prevent partial/corrupt files
being read by concurrent processes or requests.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# One global asyncio lock per file path so concurrent coroutines never interleave writes.
_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


async def _lock_for(path: Path) -> asyncio.Lock:
    key = str(path)
    async with _locks_guard:
        if key not in _locks:
            _locks[key] = asyncio.Lock()
        return _locks[key]


async def read_json(path: Path) -> Any | None:
    """Read and parse a JSON file. Returns None if missing or unreadable."""
    if not path.exists():
        return None
    try:
        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, path.read_text, "utf-8")
        return json.loads(text)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("json_store.read_json failed for %s: %s", path, exc)
        return None


async def write_json(path: Path, data: Any) -> None:
    """Atomically write *data* as JSON to *path* (write temp → rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    lock = await _lock_for(path)
    async with lock:
        try:
            loop = asyncio.get_running_loop()
            text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            await loop.run_in_executor(None, tmp.write_text, text, "utf-8")
            await loop.run_in_executor(None, os.replace, tmp, path)
        except OSError as exc:
            logger.error("json_store.write_json failed for %s: %s", path, exc)
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise


async def upsert_aircraft(path: Path, icao24: str, aircraft_data: dict[str, Any]) -> None:
    """Insert or overwrite a single aircraft record in the aircraft JSON cache.

    The file stores a dict keyed by lowercase ICAO24. Each entry also carries
    a ``cached_at`` ISO timestamp so callers can check freshness.
    """
    import datetime

    lock = await _lock_for(path)
    async with lock:
        existing: dict[str, Any] = {}
        if path.exists():
            try:
                loop = asyncio.get_running_loop()
                text = await loop.run_in_executor(None, path.read_text, "utf-8")
                existing = json.loads(text)
            except (OSError, json.JSONDecodeError):
                existing = {}

        aircraft_data["cached_at"] = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat() + "Z"
        existing[icao24.lower()] = aircraft_data

        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        try:
            loop = asyncio.get_running_loop()
            text = json.dumps(existing, ensure_ascii=False, separators=(",", ":"))
            await loop.run_in_executor(None, tmp.write_text, text, "utf-8")
            await loop.run_in_executor(None, os.replace, tmp, path)
        except OSError as exc:
            logger.error("json_store.upsert_aircraft failed for %s: %s", path, exc)
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise


async def get_aircraft(path: Path, icao24: str, max_age_seconds: int = 600) -> dict[str, Any] | None:
    """Return a cached aircraft record if it exists and is not stale.

    Returns None if the file is missing, the ICAO24 is not found, or the
    record is older than *max_age_seconds*.
    """
    import datetime

    data = await read_json(path)
    if not isinstance(data, dict):
        return None
    record = data.get(icao24.lower())
    if not isinstance(record, dict):
        return None

    cached_at_str = record.get("cached_at")
    if cached_at_str:
        try:
            cached_at = datetime.datetime.fromisoformat(cached_at_str.rstrip("Z"))
            age = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - cached_at).total_seconds()
            if age > max_age_seconds:
                return None
        except ValueError:
            pass  # malformed timestamp — treat as valid to avoid re-fetch loop

    return record
