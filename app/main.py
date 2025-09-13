from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.routes import poems
from app.data.events import init_db

import os
import logging
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse, Response
from starlette.middleware.gzip import GZipMiddleware

from typing import Optional, Dict, Any
from fastapi import Depends, Header, HTTPException
from jwt import (
    decode as jwt_decode,
    PyJWKClient,
    InvalidTokenError,
    get_unverified_header,
)
from sqlalchemy import text
from fastapi.responses import JSONResponse
from app.db import engine
from app.data.subscriptions import is_subscribed, ensure_user_row

setup_logging()
init_db()
app = FastAPI(title="ChronoVerse", version="1.2")

# --- Supabase JWT verification (RS256 via JWKS) ---
SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWT_JWKS_URL")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
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
        return jwt_decode(
            token, signing_key, algorithms=["RS256"], options={"verify_aud": False}
        )

    # HS256 via shared secret (many existing Supabase projects)
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            raise InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET not set")
        return jwt_decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )

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

# Serve built frontend (Vite output) if present — support both Vite defaults and custom outDir
_STATIC_CANDIDATES = ["web/dist", "web/build"]
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

cfg = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


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

    return {"userId": user_id, "email": email, "subscribed": subscribed}


@app.post("/api/billing/checkout")
async def checkout_stub():
    # Placeholder; will later create a Stripe Checkout Session
    return {"url": "#"}


@app.get("/healthz")
async def healthz():
    return {"ok": True}


app.include_router(poems.router)


@app.get("/api/_db/health")
async def db_health():
    """Lightweight DB probe used locally and on Railway."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"dialect": engine.dialect.name, "ok": True}
    except Exception as e:
        return JSONResponse(
            {"dialect": engine.dialect.name, "ok": False, "error": str(e)},
            status_code=500,
        )


def _index_response():
    if INDEX_PATH and os.path.exists(INDEX_PATH):
        return FileResponse(INDEX_PATH)
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
    return _index_response()
