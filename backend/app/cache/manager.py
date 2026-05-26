import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

from aiocache import Cache

T = TypeVar("T")


class CacheManager:
    def __init__(self) -> None:
        self.cache = Cache(Cache.MEMORY)
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    async def get_or_set(self, key: str, ttl: int, factory: Callable[[], Awaitable[T]]) -> T:
        cached = await self.cache.get(key)
        if cached is not None:
            return cached

        lock = await self._lock_for(key)
        async with lock:
            cached = await self.cache.get(key)
            if cached is not None:
                return cached
            value = await factory()
            await self.cache.set(key, value, ttl=ttl)
            return value

    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock
