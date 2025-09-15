import os
import json
import asyncio
from typing import Optional
from cachetools import TTLCache

try:
    # redis>=5 provides asyncio client under redis.asyncio
    from redis.asyncio import Redis as _Redis
except Exception:  # pragma: no cover
    _Redis = None  # type: ignore

_LOCAL_TTL = int(os.getenv("CACHE_TTL_SECONDS", "60") or 60)
_cache = TTLCache(maxsize=2048, ttl=_LOCAL_TTL)  # local fallback cache
_locks: dict[str, asyncio.Lock] = {}
_redis: Optional[_Redis] = None  # type: ignore[assignment]
_redis_disabled: bool = False


def _redis_client() -> Optional[_Redis]:  # type: ignore[override]
    global _redis
    if _redis_disabled:
        return None
    if _redis is not None:
        return _redis
    url = os.getenv("REDIS_URL")
    if url and _Redis is not None:
        # decode_responses=True gives us str payloads
        _redis = _Redis.from_url(url, encoding="utf-8", decode_responses=True)
    else:
        _redis = None
    return _redis


# --- Async cache API (preferred) ---


async def aget(key: str) -> Optional[dict]:
    r = _redis_client()
    if r:
        try:
            val = await r.get(key)
        except Exception:
            # Disable redis on first error, then fall back to local cache
            global _redis, _redis_disabled
            _redis = None
            _redis_disabled = True
            val = None
        if not val:
            return None
        try:
            return json.loads(val)
        except Exception:
            return None
    # Fallback to local TTL cache
    try:
        return _cache[key]
    except KeyError:
        return None


async def aset(key: str, value: dict, ttl_seconds: Optional[int] = None) -> None:
    ttl = int(ttl_seconds or _LOCAL_TTL)
    r = _redis_client()
    if r:
        try:
            await r.set(key, json.dumps(value), ex=ttl)
            return
        except Exception:
            global _redis, _redis_disabled
            _redis = None
            _redis_disabled = True
    _cache[key] = value


# --- Distributed/local async lock ---


class _LocalAsyncLock:
    def __init__(self, lock: asyncio.Lock):
        self._lock = lock

    async def __aenter__(self):
        await self._lock.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        try:
            self._lock.release()
        except RuntimeError:
            pass


class _RedisOrLocalLock:
    def __init__(self, redis_client: _Redis, key: str, timeout_seconds: int):  # type: ignore[name-defined]
        self._r = redis_client
        self._key = key
        self._timeout = timeout_seconds
        self._redis_lock = None
        self._local_lock: Optional[asyncio.Lock] = None

    async def __aenter__(self):
        # Try Redis first
        try:
            self._redis_lock = self._r.lock(
                f"cv:lock:{self._key}",
                timeout=self._timeout,
                blocking=True,
                blocking_timeout=self._timeout,
            )
            await self._redis_lock.acquire()
            return self
        except Exception:
            # Disable redis to avoid repeated attempts
            global _redis, _redis_disabled
            _redis = None
            _redis_disabled = True
            self._redis_lock = None

        # Fallback to local lock
        lock = _locks.get(self._key)
        if lock is None:
            lock = asyncio.Lock()
            _locks[self._key] = lock
        self._local_lock = lock
        await self._local_lock.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._redis_lock is not None:
            try:
                await self._redis_lock.release()
                return
            except Exception:
                pass
        if self._local_lock is not None:
            try:
                if self._local_lock.locked():
                    self._local_lock.release()
            except Exception:
                pass


def alock(key: str, timeout_seconds: int = 10):
    """Return an async context manager lock scoped by key.
    Uses Redis distributed lock when REDIS_URL is set; otherwise per-process lock.
    On Redis connection errors, gracefully falls back to a local lock.
    """
    r = _redis_client()
    if r is not None:
        return _RedisOrLocalLock(r, key, timeout_seconds)
    # Local per-process lock
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return _LocalAsyncLock(lock)


# --- Legacy sync helpers (kept for compatibility) ---


def get(key: str):
    try:
        return _cache[key]
    except KeyError:
        return None


def set(key: str, value: dict):
    _cache[key] = value
