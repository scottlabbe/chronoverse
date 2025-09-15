import datetime as dt
from sqlalchemy import text
from app.db import engine, is_postgres

ACTIVE_STATUSES = ("active", "trialing")


def is_subscribed(user_id: str, now: dt.datetime | None = None) -> bool:
    """
    True if the user has an active/trialing sub whose period hasn't ended.
    DB-agnostic: normalize timestamps to timezone-aware UTC before comparing.
    """
    if not user_id:
        return False
    now_dt = (now.astimezone(dt.timezone.utc) if (now and now.tzinfo) else (now or dt.datetime.now(dt.timezone.utc)))
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=dt.timezone.utc)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                "SELECT status, current_period_end FROM subscriptions "
                "WHERE user_id = :uid ORDER BY current_period_end DESC LIMIT 1"
            ),
            {"uid": user_id},
        ).first()
    if not row:
        return False
    status, cpe = row[0], row[1]

    # Normalize cpe to a timezone-aware UTC datetime for comparison
    cpe_dt: dt.datetime | None = None
    if isinstance(cpe, dt.datetime):
        if cpe.tzinfo is not None:
            try:
                cpe_dt = cpe.astimezone(dt.timezone.utc)
            except Exception:
                cpe_dt = cpe.replace(tzinfo=dt.timezone.utc)
        else:
            cpe_dt = cpe.replace(tzinfo=dt.timezone.utc)
    elif isinstance(cpe, str):
        s = (cpe or "").strip()
        try:
            if "T" not in s and " " in s:
                s = s.replace(" ", "T", 1)
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
            if d.tzinfo is None:
                cpe_dt = d.replace(tzinfo=dt.timezone.utc)
            else:
                cpe_dt = d.astimezone(dt.timezone.utc)
        except Exception:
            cpe_dt = None

    if cpe_dt is None:
        return False
    return status in ACTIVE_STATUSES and cpe_dt > now_dt


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


def get_stripe_customer_id(user_id: str) -> str | None:
    if not user_id:
        return None
    with engine.begin() as conn:
        res = conn.execute(
            text("SELECT stripe_customer_id FROM users WHERE id = :uid LIMIT 1"),
            {"uid": user_id},
        ).first()
        return (res[0] if res and res[0] else None)


def set_stripe_customer_id(user_id: str, customer_id: str) -> None:
    if not user_id or not customer_id:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET stripe_customer_id = :cid WHERE id = :uid"
            ),
            {"uid": user_id, "cid": customer_id},
        )


def find_user_id_by_stripe_customer(customer_id: str) -> str | None:
    if not customer_id:
        return None
    with engine.begin() as conn:
        res = conn.execute(
            text("SELECT id FROM users WHERE stripe_customer_id = :cid LIMIT 1"),
            {"cid": customer_id},
        ).first()
        return (res[0] if res and res[0] else None)


def upsert_subscription(
    sub_id: str,
    user_id: str,
    status: str,
    price_id: str,
    plan: str,
    current_period_end: dt.datetime,
) -> None:
    if not sub_id or not user_id:
        return
    cpe_val = current_period_end or dt.datetime.now(dt.timezone.utc)
    if cpe_val.tzinfo is None:
        cpe_val = cpe_val.replace(tzinfo=dt.timezone.utc)
    params = {
        "id": sub_id,
        "user_id": user_id,
        "status": status,
        "price_id": price_id,
        "plan": plan,
        "cpe": cpe_val,
    }
    sql_pg = (
        "INSERT INTO subscriptions (id, user_id, status, price_id, plan, current_period_end) "
        "VALUES (:id, :user_id, :status, :price_id, :plan, :cpe) "
        "ON CONFLICT (id) DO UPDATE SET "
        "user_id = EXCLUDED.user_id, status = EXCLUDED.status, price_id = EXCLUDED.price_id, "
        "plan = EXCLUDED.plan, current_period_end = EXCLUDED.current_period_end"
    )
    sql_sqlite = (
        "INSERT OR REPLACE INTO subscriptions (id, user_id, status, price_id, plan, current_period_end) "
        "VALUES (:id, :user_id, :status, :price_id, :plan, :cpe)"
    )
    with engine.begin() as conn:
        conn.execute(text(sql_pg if is_postgres() else sql_sqlite), params)


def update_subscription_status(
    sub_id: str, status: str, current_period_end: dt.datetime
) -> None:
    if not sub_id:
        return
    cpe_iso = (current_period_end or dt.datetime.now(dt.timezone.utc))
    if cpe_iso.tzinfo is None:
        cpe_iso = cpe_iso.replace(tzinfo=dt.timezone.utc)
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE subscriptions SET status = :status, current_period_end = :cpe WHERE id = :id"
            ),
            {"id": sub_id, "status": status, "cpe": cpe_iso},
        )
