from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.routes import poems
from app.routes import feedback as feedback_routes
from app.data.events import init_db

import os
import datetime as dt
import logging
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse, Response
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from typing import Optional, Dict, Any
from fastapi import Depends, Header, HTTPException, Request
from jwt import (
    decode as jwt_decode,
    PyJWKClient,
    InvalidTokenError,
    get_unverified_header,
)
from sqlalchemy import text
from fastapi.responses import JSONResponse
from app.db import engine
from app.data.subscriptions import (
    is_subscribed,
    ensure_user_row,
    get_stripe_customer_id,
    set_stripe_customer_id,
    upsert_subscription,
    update_subscription_status,
    find_user_id_by_stripe_customer,
)
import stripe

# --- helpers for Stripe timestamps/subscription period end ---
def _to_utc_dt_from_unix(ts: int | str | None) -> dt.datetime | None:
    try:
        if ts is None:
            return None
        # Stripe uses unix seconds; tolerate strings
        val = int(ts)
        if val <= 0:
            return None
        return dt.datetime.fromtimestamp(val, tz=dt.timezone.utc)
    except Exception:
        return None


def _derive_subscription_cpe(sub: dict) -> dt.datetime | None:
    """Best-effort extraction of current_period_end for a Stripe subscription.

    Falls back to trial_end or latest invoice line period end when needed.
    As a last resort, approximates based on price interval to avoid gating a
    paid user immediately after checkout if Stripe omits cpe.
    """
    # 1) Prefer current_period_end if present
    cpe = _to_utc_dt_from_unix(sub.get("current_period_end"))
    if cpe:
        return cpe

    # 2) If in trial, use trial_end
    trial_end = _to_utc_dt_from_unix(sub.get("trial_end"))
    if trial_end:
        return trial_end

    # 3) Try latest_invoice line period end
    latest_invoice = sub.get("latest_invoice")
    try:
        invoice_obj: dict | None = None
        if isinstance(latest_invoice, str) and latest_invoice:
            invoice_obj = stripe.Invoice.retrieve(latest_invoice)  # type: ignore
        elif isinstance(latest_invoice, dict):
            invoice_obj = latest_invoice
        if invoice_obj:
            lines = (invoice_obj.get("lines") or {}).get("data") or []
            best: dt.datetime | None = None
            for ln in lines:
                per = (ln or {}).get("period") or {}
                end_dt = _to_utc_dt_from_unix(per.get("end"))
                if end_dt and (best is None or end_dt > best):
                    best = end_dt
            if best:
                return best
    except Exception:
        # Ignore and continue to approximation
        pass

    # 4) Approximate from price interval (monthly/yearly)
    try:
        items = (sub.get("items") or {}).get("data") or []
        price = (items[0].get("price") if items else {}) or {}
        recurring = (price.get("recurring") or {})
        interval = recurring.get("interval")
        interval_count = int(recurring.get("interval_count") or 1)
        start = _to_utc_dt_from_unix(sub.get("current_period_start")) or dt.datetime.now(
            dt.timezone.utc
        )
        if interval == "year":
            return start + dt.timedelta(days=365 * interval_count)
        if interval == "month":
            # Use 30 days per month approximation; good enough for gating
            return start + dt.timedelta(days=30 * interval_count)
    except Exception:
        pass

    return None

setup_logging()
init_db()
_ENABLE_SWAGGER = os.getenv("ENABLE_SWAGGER", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
app = FastAPI(
    title="The Present Verse",
    version="1.2",
    docs_url="/docs" if _ENABLE_SWAGGER else None,
    redoc_url="/redoc" if _ENABLE_SWAGGER else None,
)

# --- Supabase JWT verification (RS256 via JWKS) ---
SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWT_JWKS_URL")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
SUPABASE_ISS = os.environ.get("SUPABASE_ISS") or os.environ.get("SUPABASE_JWT_ISSUER")
(
    logging.getLogger(__name__).warning(
        "SUPABASE_JWT_JWKS_URL not set; authenticated routes will return 401 until configured."
    )
    if not SUPABASE_JWKS_URL
    else None
)
_JWK_CLIENT: Optional[PyJWKClient] = (
    PyJWKClient(SUPABASE_JWKS_URL) if SUPABASE_JWKS_URL else None
)


def verify_bearer_token(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise InvalidTokenError("Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        header = get_unverified_header(token)
    except Exception as e:
        raise InvalidTokenError("Invalid JWT header") from e

    alg = header.get("alg")

    # RS256 via JWKS (newer Supabase projects)
    if alg == "RS256":
        if not _JWK_CLIENT:
            raise InvalidTokenError("JWKS client not configured")
        signing_key = _JWK_CLIENT.get_signing_key_from_jwt(token).key
        claims = jwt_decode(
            token, signing_key, algorithms=["RS256"], options={"verify_aud": False}
        )
        if SUPABASE_ISS and claims.get("iss") != SUPABASE_ISS:
            raise InvalidTokenError("Invalid issuer")
        return claims

    # HS256 via shared secret (many existing Supabase projects)
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            raise InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET not set")
        claims = jwt_decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        if SUPABASE_ISS and claims.get("iss") != SUPABASE_ISS:
            raise InvalidTokenError("Invalid issuer")
        return claims

    raise InvalidTokenError(f"Unsupported alg: {alg}")


def get_current_user(authorization: Optional[str] = Header(None)):
    """Return minimal user identity from a Supabase JWT or 401.
    Accepts Bearer token in the Authorization header; verifies via JWKS (RS256).
    """
    try:
        claims = verify_bearer_token(authorization)
        return {"user_id": claims.get("sub"), "email": claims.get("email")}
    except Exception:
        # Catch all JWT-related errors (expired/invalid/missing/JWKS issues) as Unauthorized
        raise HTTPException(status_code=401, detail="Unauthorized")


# --- end Supabase JWT helpers ---

# Serve built frontend (Vite output) if present — support legacy and current paths
_STATIC_CANDIDATES = [
    "apps/web/dist",
    "apps/web/build",
    "web/dist",
    "web/build",
]
STATIC_DIR = next(
    (p for p in _STATIC_CANDIDATES if os.path.exists(os.path.join(p, "index.html"))),
    None,
)
if STATIC_DIR and os.path.isdir(os.path.join(STATIC_DIR, "assets")):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(STATIC_DIR, "assets")),
        name="assets",
    )
INDEX_PATH = os.path.join(STATIC_DIR, "index.html") if STATIC_DIR else None
MANIFEST_PATH = (
    os.path.join(STATIC_DIR, "manifest.webmanifest") if STATIC_DIR else None
)
SW_PATH = os.path.join(STATIC_DIR, "sw.js") if STATIC_DIR else None


def _file_response(path: str, *, media_type: str | None = None, cache_control: str | None = None):
    headers = {}
    if cache_control:
        headers["Cache-Control"] = cache_control
    return FileResponse(path, media_type=media_type, headers=headers)

cfg = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
app.add_middleware(GZipMiddleware, minimum_size=500)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Baseline headers
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        # Optional HSTS
        if os.getenv("ENABLE_HSTS", "0").strip().lower() in ("1", "true", "yes", "on"):
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )
        # Optional CSP (can be overridden with CSP_POLICY)
        if os.getenv("ENABLE_CSP", "0").strip().lower() in ("1", "true", "yes", "on"):
            default_csp = (
                "default-src 'self'; "
                "connect-src 'self' https://*.supabase.co; "
                "img-src 'self' data:; "
                "style-src 'self' 'unsafe-inline'; "
                "script-src 'self' 'wasm-unsafe-eval'"
            )
            csp = os.getenv("CSP_POLICY", default_csp)
            response.headers.setdefault("Content-Security-Policy", csp)
        return response


app.add_middleware(SecurityHeadersMiddleware)


@app.get("/manifest.webmanifest")
async def manifest():
    if MANIFEST_PATH and os.path.exists(MANIFEST_PATH):
        return _file_response(
            MANIFEST_PATH,
            media_type="application/manifest+json",
            cache_control="no-cache, max-age=0",
        )
    return Response(status_code=404)


@app.get("/sw.js")
@app.get("/service-worker.js")
async def service_worker():
    if SW_PATH and os.path.exists(SW_PATH):
        return _file_response(SW_PATH, cache_control="no-cache, max-age=0")
    return Response(status_code=404)


@app.get("/api/me")
async def me(user=Depends(get_current_user)):
    # Extract from verified token
    user_id = user.get("user_id")
    email = user.get("email")

    # Ensure a users row exists (best-effort, non-fatal)
    try:
        ensure_user_row(user_id, email)
    except Exception:
        pass

    # Compute real subscription status (fallback to False on any error)
    try:
        subscribed = is_subscribed(user_id)
    except Exception:
        subscribed = False
    logging.getLogger(__name__).info("/api/me user=%s subscribed=%s", user_id, subscribed)

    return {"userId": user_id, "email": email, "subscribed": subscribed}


@app.post("/api/billing/checkout")
async def checkout_stub(user=Depends(get_current_user)):
    # Create a Stripe Checkout Session for a subscription
    public_base = getattr(cfg, "PUBLIC_BASE_URL", None)
    price_id = getattr(cfg, "PRICE_ID", None)
    secret = getattr(cfg, "STRIPE_SECRET_KEY", None) or os.getenv("STRIPE_SECRET_KEY")
    if not (public_base and price_id and secret):
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = secret

    user_id = user.get("user_id")
    email = user.get("email")

    # Best-effort ensure user row; ignore failures (email is NOT NULL in schema)
    try:
        ensure_user_row(user_id, email)
    except Exception:
        pass

    customer_id = None
    try:
        customer_id = get_stripe_customer_id(user_id)
    except Exception:
        customer_id = None

    payload = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "client_reference_id": user_id,
        # Include session_id so we can verify on return even without webhooks
        "success_url": f"{public_base}/app?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{public_base}/app",
    }
    if customer_id:
        payload["customer"] = customer_id
    elif email:
        payload["customer_email"] = email

    try:
        session = stripe.checkout.Session.create(**payload)  # type: ignore
        return {"url": session["url"]}
    except Exception as e:
        logging.getLogger(__name__).exception("stripe.checkout.create failed")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@app.get("/api/billing/portal")
async def billing_portal(user=Depends(get_current_user)):
    public_base = getattr(cfg, "PUBLIC_BASE_URL", None)
    secret = getattr(cfg, "STRIPE_SECRET_KEY", None) or os.getenv("STRIPE_SECRET_KEY")
    if not (public_base and secret):
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = secret

    user_id = user.get("user_id")
    email = user.get("email")

    # Best-effort ensure users row
    try:
        ensure_user_row(user_id, email)
    except Exception:
        pass

    try:
        customer_id = get_stripe_customer_id(user_id)
        if not customer_id:
            cust = stripe.Customer.create(email=email or None, metadata={"user_id": user_id})  # type: ignore
            customer_id = cust["id"]
            set_stripe_customer_id(user_id, customer_id)
        # Allow specifying a specific portal configuration via env
        conf_id = getattr(cfg, "STRIPE_PORTAL_CONFIGURATION_ID", None) or os.getenv("STRIPE_PORTAL_CONFIGURATION_ID")
        params: dict[str, object] = {
            "customer": customer_id,
            "return_url": f"{public_base}/app",
        }
        if conf_id:
            params["configuration"] = conf_id
        ps = stripe.billing_portal.Session.create(**params)  # type: ignore
        return {"url": ps["url"]}
    except Exception as e:
        import stripe as _stripe
        log = logging.getLogger(__name__)
        if isinstance(e, getattr(_stripe, "error", object).__dict__.get("InvalidRequestError")):
            msg = str(e)
            # Provide actionable guidance when default portal configuration is missing
            if "default configuration" in msg or "No configuration provided" in msg:
                log.warning("billing.portal missing portal config (test mode) user=%s", user_id)
                return JSONResponse(
                    {
                        "ok": False,
                        "detail": {
                            "reason": "stripe_portal_not_configured",
                            "message": "Stripe Customer Portal is not configured in test mode. Save your portal settings in test mode or set STRIPE_PORTAL_CONFIGURATION_ID.",
                            "docs": "https://dashboard.stripe.com/test/settings/billing/portal",
                        }
                    },
                    status_code=400,
                )
        log.exception("billing.portal failed")
        raise HTTPException(status_code=500, detail="Failed to create portal session")


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    # Only endpoint without auth; protected by Stripe signature verification
    secret = getattr(cfg, "STRIPE_WEBHOOK_SECRET", None) or os.getenv("STRIPE_WEBHOOK_SECRET")
    sk = getattr(cfg, "STRIPE_SECRET_KEY", None) or os.getenv("STRIPE_SECRET_KEY")
    if not (secret and sk):
        # If not configured, refuse
        return JSONResponse({"ok": False, "reason": "stripe_not_configured"}, status_code=400)
    stripe.api_key = sk

    payload_bytes = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload_bytes.decode("utf-8"), sig, secret)  # type: ignore
    except Exception:
        return JSONResponse({"ok": False}, status_code=400)

    etype = event.get("type")
    data = event.get("data", {}).get("object", {})

    log = logging.getLogger(__name__)

    def _to_dt(ts: int | None) -> dt.datetime:
        try:
            return dt.datetime.fromtimestamp(int(ts or 0), tz=dt.timezone.utc)
        except Exception:
            return dt.datetime.now(dt.timezone.utc)

    def _interval_to_plan(interval: str | None) -> str:
        if interval == "month":
            return "monthly"
        if interval == "year":
            return "yearly"
        return (interval or "unknown")

    try:
        if etype == "checkout.session.completed":
            session = data
            user_id = session.get("client_reference_id")
            customer_id = session.get("customer")
            email = (session.get("customer_details") or {}).get("email")

            if user_id:
                try:
                    ensure_user_row(user_id, email)
                except Exception:
                    pass
            if user_id and customer_id:
                set_stripe_customer_id(user_id, customer_id)

            sub_id = session.get("subscription")
            if sub_id and user_id:
                sub = stripe.Subscription.retrieve(sub_id)  # type: ignore
                items = (sub.get("items") or {}).get("data") or []
                price = (items[0].get("price") if items else {}) or {}
                status = sub.get("status") or "active"
                cpe = _derive_subscription_cpe(sub) or _to_dt(sub.get("current_period_end"))
                price_id = price.get("id") or "unknown"
                interval = (price.get("recurring") or {}).get("interval")
                plan = _interval_to_plan(interval)
                upsert_subscription(sub_id, user_id, status, price_id, plan, cpe)

            log.info(
                "stripe.webhook event=checkout.session.completed user=%s sub=%s",
                user_id,
                sub_id,
            )

        elif etype in ("customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.created"):
            sub = data
            sub_id = sub.get("id")
            customer_id = sub.get("customer")
            user_id = find_user_id_by_stripe_customer(customer_id)
            status = sub.get("status") or "active"
            cpe = _derive_subscription_cpe(sub) or _to_dt(sub.get("current_period_end"))
            items = (sub.get("items") or {}).get("data") or []
            price = (items[0].get("price") if items else {}) or {}
            price_id = price.get("id") or "unknown"
            interval = (price.get("recurring") or {}).get("interval")
            plan = _interval_to_plan(interval)
            if sub_id and user_id:
                upsert_subscription(sub_id, user_id, status, price_id, plan, cpe)
            log.info(
                "stripe.webhook event=%s user=%s sub=%s status=%s",
                etype,
                user_id,
                sub_id,
                status,
            )
        else:
            # Ignore unhandled event types
            log.info("stripe.webhook ignored event=%s", etype)
    except Exception:
        log.exception("stripe.webhook handler error for event=%s", etype)
        return JSONResponse({"ok": False}, status_code=500)

    return {"ok": True}


@app.get("/api/billing/verify")
async def billing_verify(session_id: str, user=Depends(get_current_user)):
    """
    Fallback verification when returning from Stripe Checkout.
    Idempotently upserts subscription based on the Checkout Session.
    Requires auth and the session must reference the current user.
    """
    public_base = getattr(cfg, "PUBLIC_BASE_URL", None)
    secret = getattr(cfg, "STRIPE_SECRET_KEY", None) or os.getenv("STRIPE_SECRET_KEY")
    if not (public_base and secret):
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = secret

    user_id = user.get("user_id")
    email = user.get("email")

    try:
        # Retrieve Checkout Session and validate ownership
        session = stripe.checkout.Session.retrieve(session_id)  # type: ignore
        if not session:
            raise HTTPException(status_code=404, detail="session_not_found")

        ref = session.get("client_reference_id")
        if not user_id or not ref or ref != user_id:
            raise HTTPException(status_code=403, detail="forbidden")

        # Ensure we have a users row
        try:
            ensure_user_row(user_id, email)
        except Exception:
            pass

        # Persist customer id if available
        customer_id = session.get("customer")
        if customer_id:
            set_stripe_customer_id(user_id, customer_id)

        # If the session created/has a subscription, mirror it to our DB
        sub_id = session.get("subscription")
        subscribed = False
        if sub_id:
            sub = stripe.Subscription.retrieve(sub_id)  # type: ignore
            items = (sub.get("items") or {}).get("data") or []
            price = (items[0].get("price") if items else {}) or {}
            status = sub.get("status") or "active"
            # Derive a reliable current_period_end value
            cpe = _derive_subscription_cpe(sub) or (
                dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=30)
            )
            price_id = price.get("id") or "unknown"
            interval = (price.get("recurring") or {}).get("interval")
            plan = "monthly" if interval == "month" else ("yearly" if interval == "year" else (interval or "unknown"))
            upsert_subscription(sub_id, user_id, status, price_id, plan, cpe)
            subscribed = status in ("active", "trialing") and cpe > dt.datetime.now(dt.timezone.utc)
            logging.getLogger(__name__).info(
                "billing.verify user=%s ref=%s session=%s sub=%s status=%s raw_cpe=%s raw_trial_end=%s cpe=%s subscribed=%s",
                user_id,
                ref,
                session_id,
                sub_id,
                status,
                sub.get("current_period_end"),
                sub.get("trial_end"),
                cpe.isoformat(),
                subscribed,
            )
        else:
            # No subscription on session; consider payment status
            subscribed = False

        # Also compute from DB to reflect gating reality
        try:
            db_sub = is_subscribed(user_id)
        except Exception:
            db_sub = subscribed
        return {"ok": True, "subscribed": bool(db_sub)}
    except HTTPException:
        raise
    except Exception:
        logging.getLogger(__name__).exception("billing.verify failed")
        raise HTTPException(status_code=500, detail="verify_failed")


@app.get("/healthz")
async def healthz():
    return {"ok": True}


app.include_router(poems.router)
app.include_router(feedback_routes.router)


@app.get("/api/_db/health")
async def db_health(request: Request):
    """Lightweight DB probe. Optionally protected by X-Health-Token when HEALTH_TOKEN is set."""
    required = os.getenv("HEALTH_TOKEN")
    if required:
        provided = request.headers.get("x-health-token") or request.headers.get(
            "X-Health-Token"
        )
        if not provided or provided != required:
            return JSONResponse({"ok": False}, status_code=401)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception:
        return JSONResponse({"ok": False}, status_code=500)


def _index_response():
    if INDEX_PATH and os.path.exists(INDEX_PATH):
        # Avoid caching the SPA shell so asset maps stay in sync after rebuilds
        return FileResponse(INDEX_PATH, headers={"Cache-Control": "no-cache, max-age=0"})
    return Response(
        "Frontend build not found. Run `npm run build` in ./web.",
        media_type="text/plain",
        status_code=404,
    )


@app.get("/")
async def index():
    return _index_response()


@app.get("/{full_path:path}")
async def spa(full_path: str):
    # Do not intercept API or well-known public paths we might add later
    if full_path.startswith("api/"):
        return Response(status_code=404)
    if STATIC_DIR and full_path:
        safe = os.path.normpath(full_path)
        if not safe.startswith(".."):
            candidate = os.path.join(STATIC_DIR, safe)
            if os.path.isfile(candidate):
                cache_control = None
                if candidate.endswith(".webmanifest") or os.path.basename(candidate) in {"sw.js", "service-worker.js"}:
                    cache_control = "no-cache, max-age=0"
                return _file_response(candidate, cache_control=cache_control)
    return _index_response()


@app.get("/api/billing/status")
async def billing_status(user=Depends(get_current_user)):
    """Return the server's view of the user's subscription row (for debugging/UX)."""
    from sqlalchemy import text as _text
    uid = user.get("user_id")
    try:
        with engine.begin() as conn:
            row = conn.execute(
                _text(
                    "SELECT id, status, price_id, plan, current_period_end "
                    "FROM subscriptions WHERE user_id = :uid "
                    "ORDER BY current_period_end DESC LIMIT 1"
                ),
                {"uid": uid},
            ).first()
        if not row:
            return {"subscribed": False, "status": None}
        sub = {
            "id": row[0],
            "status": row[1],
            "price_id": row[2],
            "plan": row[3],
            "current_period_end": str(row[4]),
        }
        return {"subscribed": is_subscribed(uid), "subscription": sub}
    except Exception:
        logging.getLogger(__name__).exception("billing.status failed")
        return JSONResponse({"ok": False}, status_code=500)
