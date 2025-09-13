import datetime as dt
from sqlalchemy import text
from app.db import engine, is_postgres

ACTIVE_STATUSES = ("active", "trialing")


def is_subscribed(user_id: str, now: dt.datetime | None = None) -> bool:
    """
    True if the user has an active/trialing sub whose period hasn't ended.
    Works on Postgres & SQLite.
    """
    if not user_id:
        return False
    now_iso = (now or dt.datetime.utcnow()).isoformat()
    sql = (
        "SELECT 1 FROM subscriptions "
        "WHERE user_id = :uid AND status IN ('active','trialing') "
        "AND current_period_end > :now LIMIT 1"
    )
    with engine.begin() as conn:
        res = conn.execute(text(sql), {"uid": user_id, "now": now_iso})
        return res.first() is not None


def ensure_user_row(
    user_id: str, email: str | None = None, auth_provider_id: str | None = None
) -> None:
    """
    Best-effort upsert to ensure a users row exists. No-op on conflicts.
    """
    if not user_id:
        return
    params = {"id": user_id, "email": email, "auth_provider_id": auth_provider_id}
    sql_pg = (
        "INSERT INTO users (id, email, auth_provider_id) "
        "VALUES (:id, :email, :auth_provider_id) "
        "ON CONFLICT (id) DO NOTHING"
    )
    sql_sqlite = (
        "INSERT OR IGNORE INTO users (id, email, auth_provider_id) "
        "VALUES (:id, :email, :auth_provider_id)"
    )
    with engine.begin() as conn:
        conn.execute(text(sql_pg if is_postgres() else sql_sqlite), params)
