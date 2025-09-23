# Events & usage logging (SQLite + Postgres)
# Tables:
#   events(
#     ts_iso TEXT NOT NULL,
#     request_id TEXT,
#     status TEXT,
#     model TEXT,
#     tone TEXT,
#     timezone TEXT,
#     prompt_tokens INT,
#     completion_tokens INT,
#     cost_usd REAL,
#     cached INT,
#     user_id TEXT,
#     auth_provider_id TEXT,
#     session_id TEXT,
#     minute_bucket TEXT,
#     latency_ms INT,
#     idempotency_key TEXT,
#     extra_json TEXT
#   )
#   usage_events(
#     user_id TEXT NOT NULL,
#     minute_bucket TEXT NOT NULL,
#     request_id TEXT,
#     PRIMARY KEY(user_id, minute_bucket)
#   )
import os
import datetime as dt
import json
import threading
from typing import Optional
import sqlite3

from sqlalchemy import text

from app.db import engine, is_postgres, is_sqlite

# ---- Helpers & module state ----
_INIT_LOCK = threading.Lock()

_SQLITE_PATH: Optional[str] = None
if is_sqlite():
    try:
        _SQLITE_PATH = engine.url.database
    except Exception:
        _SQLITE_PATH = None

def _utc_now_iso() -> str:
    """UTC timestamp, second precision, with trailing 'Z'."""
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def init_db():
    if is_sqlite() and _SQLITE_PATH:
        directory = os.path.dirname(_SQLITE_PATH)
        if directory:
            os.makedirs(directory, exist_ok=True)
    with _INIT_LOCK:
        with engine.begin() as conn:
            # Create events table with the full schema (works on SQLite and Postgres)
            conn.execute(
                text(
                    """
                CREATE TABLE IF NOT EXISTS events(
                    ts_iso TEXT,
                    request_id TEXT,
                    status TEXT,
                    model TEXT,
                    tone TEXT,
                    timezone TEXT,
                    prompt_tokens INT,
                    completion_tokens INT,
                    cost_usd REAL,
                    cached INT,
                    user_id TEXT,
                    auth_provider_id TEXT,
                    session_id TEXT,
                    minute_bucket TEXT,
                    latency_ms INT,
                    idempotency_key TEXT,
                    extra_json TEXT
                )
                """
                )
            )
            # Indexes (IF NOT EXISTS is supported in both SQLite and Postgres)
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_iso)")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, ts_iso)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_events_minute ON events(minute_bucket)"
                )
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idem ON events(idempotency_key)"
                )
            )

            # Usage table for free-tier minute metering
            conn.execute(
                text(
                    """
                CREATE TABLE IF NOT EXISTS usage_events(
                    user_id TEXT NOT NULL,
                    minute_bucket TEXT NOT NULL,
                    request_id TEXT,
                    PRIMARY KEY(user_id, minute_bucket)
                )
                """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_usage_user_minute ON usage_events(user_id, minute_bucket)"
                )
            )
            # Feedback table for durable logging of user feedback
            conn.execute(
                text(
                    """
                CREATE TABLE IF NOT EXISTS feedback(
                    ts_iso TEXT,
                    user_id TEXT,
                    email TEXT,
                    message TEXT,
                    include_context INT,
                    context_json TEXT,
                    user_agent TEXT,
                    path TEXT,
                    ip TEXT
                )
                    """
                )
            )

def write_event(row: dict):
    """Insert a log row. Known columns go to dedicated fields; everything else is packed into extra_json.
    New fields supported (optional): user_id, auth_provider_id, session_id, minute_bucket, latency_ms, idempotency_key.
    """
    base_keys = {
        "ts_iso",
        "request_id",
        "status",
        "model",
        "tone",
        "timezone",
        "prompt_tokens",
        "completion_tokens",
        "cost_usd",
        "cached",
        "user_id",
        "auth_provider_id",
        "session_id",
        "minute_bucket",
        "latency_ms",
        "idempotency_key",
    }
    # Timestamps
    ts_iso = row.get("ts_iso") or row.get("generated_at_iso") or _utc_now_iso()
    # Normalize tone to string (handles Enums)
    tone_val = row.get("tone")
    tone_str = f"{tone_val}" if tone_val is not None else None
    # Minute bucket (UTC ISO, truncated to minute)
    mb = row.get("minute_bucket") or _iso_minute(ts_iso=ts_iso)

    # Everything else goes to compact JSON
    extra = {k: v for k, v in row.items() if k not in base_keys}
    extra_json = (
        json.dumps(extra, ensure_ascii=False, separators=(",", ":")) if extra else None
    )

    params = {
        "ts_iso": ts_iso,
        "request_id": row.get("request_id"),
        "status": row.get("status"),
        "model": row.get("model"),
        "tone": tone_str,
        "timezone": row.get("timezone"),
        "prompt_tokens": row.get("prompt_tokens"),
        "completion_tokens": row.get("completion_tokens"),
        "cost_usd": row.get("cost_usd"),
        "cached": 1 if row.get("cached") else 0,
        "user_id": row.get("user_id"),
        "auth_provider_id": row.get("auth_provider_id"),
        "session_id": row.get("session_id"),
        "minute_bucket": mb,
        "latency_ms": row.get("latency_ms"),
        "idempotency_key": row.get("idempotency_key"),
        "extra_json": extra_json,
    }

    cols = (
        "ts_iso, request_id, status, model, tone, timezone, "
        "prompt_tokens, completion_tokens, cost_usd, cached, "
        "user_id, auth_provider_id, session_id, minute_bucket, latency_ms, idempotency_key, extra_json"
    )
    values = (
        ":ts_iso, :request_id, :status, :model, :tone, :timezone, "
        ":prompt_tokens, :completion_tokens, :cost_usd, :cached, "
        ":user_id, :auth_provider_id, :session_id, :minute_bucket, :latency_ms, :idempotency_key, :extra_json"
    )

    with engine.begin() as conn:
        if is_postgres():
            sql = f"INSERT INTO events ({cols}) VALUES ({values}) ON CONFLICT (idempotency_key) DO NOTHING"
        else:
            sql = f"INSERT OR IGNORE INTO events ({cols}) VALUES ({values})"
        conn.execute(text(sql), params)


def _iso_minute(ts: Optional[dt.datetime] = None, ts_iso: Optional[str] = None) -> str:
    """Return an ISO8601 string truncated to the minute (UTC), with trailing 'Z'."""
    if ts_iso:
        try:
            s = ts_iso.replace("Z", "+00:00")
            d = dt.datetime.fromisoformat(s)
        except Exception:
            # Fallback slice assuming "YYYY-MM-DDTHH:MM:SS[Z]"
            base = ts_iso[:16] + ":00"
            return base if base.endswith("Z") else base + "Z"
    else:
        d = ts or dt.datetime.utcnow()
    out = d.replace(second=0, microsecond=0).isoformat()
    return out if out.endswith("Z") else out + "Z"


def today_cost_sum() -> float:
    start = dt.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + dt.timedelta(days=1)
    with engine.begin() as conn:
        res = conn.execute(
            text(
                "SELECT COALESCE(SUM(cost_usd),0) FROM events WHERE ts_iso >= :start AND ts_iso < :end"
            ),
            {"start": start.isoformat(), "end": end.isoformat()},
        )
        val = res.scalar()
        return float(val or 0.0)


def write_feedback(row: dict) -> None:
    """Persist a feedback row into the feedback table.
    Expected keys: ts_iso, user_id, email, message, include_context (bool),
    context (dict), user_agent, path, ip.
    """
    ts_iso = row.get("ts_iso") or _utc_now_iso()
    include_context = 1 if row.get("include_context") else 0
    ctx = row.get("context") or None
    try:
        context_json = (
            json.dumps(ctx, ensure_ascii=False, separators=(",", ":")) if ctx else None
        )
    except Exception:
        context_json = None

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO feedback(ts_iso, user_id, email, message, include_context, context_json, user_agent, path, ip)
                VALUES (:ts_iso, :user_id, :email, :message, :include_context, :context_json, :user_agent, :path, :ip)
                """
            ),
            {
                "ts_iso": ts_iso,
                "user_id": row.get("user_id"),
                "email": row.get("email"),
                "message": row.get("message"),
                "include_context": include_context,
                "context_json": context_json,
                "user_agent": row.get("user_agent"),
                "path": row.get("path"),
                "ip": row.get("ip"),
            },
        )


def record_usage_minute(
    user_id: str, minute: Optional[dt.datetime] = None, request_id: Optional[str] = None
) -> bool:
    """Record usage for the given user at the minute-level. Idempotent: returns True if inserted, False if already present."""
    mb = _iso_minute(ts=minute)
    with engine.begin() as conn:
        if is_postgres():
            res = conn.execute(
                text(
                    """
                    INSERT INTO usage_events(user_id, minute_bucket, request_id)
                    VALUES (:user_id, :minute_bucket, :request_id)
                    ON CONFLICT (user_id, minute_bucket) DO NOTHING
                """
                ),
                {"user_id": user_id, "minute_bucket": mb, "request_id": request_id},
            )
        else:
            res = conn.execute(
                text(
                    "INSERT OR IGNORE INTO usage_events(user_id, minute_bucket, request_id) VALUES(:user_id, :minute_bucket, :request_id)"
                ),
                {"user_id": user_id, "minute_bucket": mb, "request_id": request_id},
            )
        return (res.rowcount or 0) > 0


def _month_bounds_utc(
    anchor: Optional[dt.datetime] = None,
) -> tuple[dt.datetime, dt.datetime]:
    d = (anchor or dt.datetime.utcnow()).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start = d.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def monthly_usage_minutes(user_id: str, anchor: Optional[dt.datetime] = None) -> int:
    """Count minute-bucketed usage for the user in the UTC month containing `anchor` (default now)."""
    start, end = _month_bounds_utc(anchor)
    with engine.begin() as conn:
        res = conn.execute(
            text(
                """
                SELECT COUNT(1)
                FROM usage_events
                WHERE user_id = :user_id AND minute_bucket >= :start AND minute_bucket < :end
            """
            ),
            {"user_id": user_id, "start": start.isoformat(), "end": end.isoformat()},
        )
        return int(res.scalar() or 0)


def purge_old_events(older_than_days: int = 90) -> dict:
    """Delete events older than N days and stale usage rows. Returns counts per table."""
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=older_than_days)
    cutoff_iso = cutoff.replace(second=0, microsecond=0).isoformat()
    cutoff_minute = _iso_minute(ts=cutoff)
    with engine.begin() as conn:
        r1 = conn.execute(
            text("DELETE FROM events WHERE ts_iso < :cutoff"), {"cutoff": cutoff_iso}
        )
        r2 = conn.execute(
            text("DELETE FROM usage_events WHERE minute_bucket < :cutoff_minute"),
            {"cutoff_minute": cutoff_minute},
        )
        return {"events": int(r1.rowcount or 0), "usage_events": int(r2.rowcount or 0)}


def vacuum_if_needed(min_mb: int = 100) -> bool:
    """VACUUM the SQLite file if size exceeds threshold. No-op for non-SQLite URLs."""
    if not (is_sqlite() and _SQLITE_PATH and os.path.isfile(_SQLITE_PATH)):
        return False
    try:
        size_mb = os.path.getsize(_SQLITE_PATH) / (1024 * 1024)
    except Exception:
        return False
    if size_mb < min_mb:
        return False
    # VACUUM must run outside an open transaction
    try:
        with sqlite3.connect(_SQLITE_PATH) as c:
            c.isolation_level = None
            c.execute("VACUUM")
        return True
    except Exception:
        return False
