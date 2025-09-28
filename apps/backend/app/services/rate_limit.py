import os
import time
from typing import Optional

try:
    from redis.asyncio import Redis as _Redis  # type: ignore
except Exception:  # pragma: no cover
    _Redis = None  # type: ignore

# Defaults allow a few tone switches per minute while preventing abuse
USER_RL_PER_MIN = int(os.getenv("USER_RL_PER_MIN", "6") or 6)
IP_RL_PER_MIN = int(os.getenv("IP_RL_PER_MIN", "60") or 60)
TOKEN_RL_PER_MIN = int(os.getenv("MOBILE_RL_PER_MIN", "60") or 60)

_redis: Optional[_Redis] = None  # type: ignore[assignment]
_mem_user: dict[str, tuple[int, float]] = {}
_mem_ip: dict[str, tuple[int, float]] = {}
_mem_token: dict[str, tuple[int, float]] = {}


def _redis_client() -> Optional[_Redis]:
    global _redis
    if _redis is not None:
        return _redis
    url = os.getenv("REDIS_URL")
    if url and _Redis is not None:
        _redis = _Redis.from_url(url, encoding="utf-8", decode_responses=True)
    else:
        _redis = None
    return _redis


def _minute_bucket(ts: Optional[float] = None) -> int:
    return int((ts or time.time()) // 60)


async def allow_user(user_id: Optional[str]) -> bool:
    if not user_id:
        # If no user id, defer to IP limiter only
        return True
    limit = max(1, USER_RL_PER_MIN)
    key = f"pv:rl:user:{user_id}:{_minute_bucket()}"
    r = _redis_client()
    if r is not None:
        try:
            val = await r.incr(key)
            if val == 1:
                await r.expire(key, 120)
            return val <= limit
        except Exception:
            pass
    # Fallback in-memory counter (per-process only)
    now = time.time()
    count, bucket_ts = _mem_user.get(user_id, (0, now))
    if _minute_bucket(bucket_ts) != _minute_bucket(now):
        count = 0
        bucket_ts = now
    count += 1
    _mem_user[user_id] = (count, bucket_ts)
    return count <= limit


async def allow_ip(ip: Optional[str]) -> bool:
    if not ip:
        return True
    limit = max(1, IP_RL_PER_MIN)
    key = f"pv:rl:ip:{ip}:{_minute_bucket()}"


async def allow_token(token: Optional[str]) -> bool:
    if not token:
        return True
    limit = max(1, TOKEN_RL_PER_MIN)
    key = f"pv:rl:token:{token}:{_minute_bucket()}"
    r = _redis_client()
    if r is not None:
        try:
            val = await r.incr(key)
            if val == 1:
                await r.expire(key, 120)
            return val <= limit
        except Exception:
            pass
    now = time.time()
    count, bucket_ts = _mem_token.get(token, (0, now))
    if _minute_bucket(bucket_ts) != _minute_bucket(now):
        count = 0
        bucket_ts = now
    count += 1
    _mem_token[token] = (count, bucket_ts)
    return count <= limit
    r = _redis_client()
    if r is not None:
        try:
            val = await r.incr(key)
            if val == 1:
                await r.expire(key, 120)
            return val <= limit
        except Exception:
            pass
    now = time.time()
    count, bucket_ts = _mem_ip.get(ip, (0, now))
    if _minute_bucket(bucket_ts) != _minute_bucket(now):
        count = 0
        bucket_ts = now
    count += 1
    _mem_ip[ip] = (count, bucket_ts)
    return count <= limit
