from fastapi import (
    APIRouter,
    Depends,
    BackgroundTasks,
    HTTPException,
    status,
    Header,
    Request,
)
from app.core.config import Settings, get_settings
from app.core.types import PoemRequest, PoemResponse
from app.adapters.registry import OpenAIAdapter
from app.services.poem_service import generate_poem, TONE_STYLE
from app.services.rate_limit import allow_user, allow_ip, allow_token

import hashlib
import hmac
import uuid
from app.data.events import record_usage_minute, monthly_usage_minutes, write_event
from app.data.subscriptions import is_subscribed

router = APIRouter(prefix="/api")

MOBILE_API_HEADER = "X-Mobile-Api-Key"


def _configured_mobile_keys(cfg: Settings) -> list[str]:
    return [k.strip() for k in getattr(cfg, "MOBILE_API_KEYS", []) if k and k.strip()]


def _matches_mobile_key(provided: str, provided_hash: str, candidate: str) -> bool:
    if not candidate:
        return False
    candidate = candidate.strip()
    if candidate.lower().startswith("sha256:"):
        expected = candidate.split(":", 1)[1]
        return hmac.compare_digest(provided_hash, expected)
    return hmac.compare_digest(provided, candidate)


def _get_current_user(authorization: str | None = Header(None)):
    """Lightweight wrapper to reuse the main JWT verification without circular imports.
    Imports the verifier lazily to avoid module import cycles with app.main.
    """
    try:
        from app.main import (
            verify_bearer_token,
        )  # lazy import avoids circular at module import time

        claims = verify_bearer_token(authorization)
        return {"user_id": claims.get("sub"), "email": claims.get("email")}
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_adapter(cfg: Settings = Depends(get_settings)) -> OpenAIAdapter:
    return OpenAIAdapter(api_key=cfg.OPENAI_API_KEY)


@router.post("/poem", response_model=PoemResponse)
async def post_poem(
    req: PoemRequest,
    bg: BackgroundTasks,
    request: Request,
    cfg: Settings = Depends(get_settings),
    adapter: OpenAIAdapter = Depends(get_adapter),
    user: dict = Depends(_get_current_user),
):
    if req.tone not in TONE_STYLE:
        raise HTTPException(400, f"Invalid tone. Valid: {list(TONE_STYLE)}")
    user_id = user["user_id"]
    # Determine whether to meter and whether to honor forceNew
    effective_force_new = bool(req.forceNew)

    # --- Rate limiting (IP + user) ---
    fwd = request.headers.get("x-forwarded-for") or request.headers.get(
        "X-Forwarded-For"
    )
    client_ip = (fwd.split(",")[0].strip() if fwd else None) or (
        request.client.host if request.client else None
    )
    if not await allow_ip(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "reason": "rate_limited_ip",
                "retry": 60,
            },
        )
    if not await allow_user(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "reason": "rate_limited_user",
                "retry": 60,
            },
        )

    # Bypass metering if/when subscribed
    if not is_subscribed(user_id):
        used = monthly_usage_minutes(user_id)
        if used >= getattr(cfg, "FREE_MINUTES", 180):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "reason": "free_limit_reached",
                    "minutesUsed": used,
                    "limit": getattr(cfg, "FREE_MINUTES", 180),
                    "upgradePath": getattr(
                        cfg, "UPGRADE_PATH", "/api/billing/checkout"
                    ),
                },
            )
        # Idempotent: only one debit per minute per user. Use as a gate as well.
        inserted = record_usage_minute(user_id=user_id, request_id=str(uuid.uuid4()))
        # If we've already recorded usage for this minute, ignore client forceNew to
        # prevent additional paid generations within the same minute.
        if not inserted:
            effective_force_new = False

    result = await generate_poem(
        cfg, adapter, req.tone, req.timezone, req.format, effective_force_new, bg
    )
    # Non-blocking event log (best-effort)
    try:
        bg.add_task(
            write_event,
            {
                "status": "ok",
                "model": "openai",  # replace with adapter.model_name if available later
                "tone": req.tone,
                "timezone": req.timezone,
                "user_id": user_id,
                "request_id": str(uuid.uuid4()),
            },
        )
    except Exception:
        pass
    return result


@router.post("/v2/poem", response_model=PoemResponse)
async def post_poem_mobile(
    req: PoemRequest,
    bg: BackgroundTasks,
    request: Request,
    cfg: Settings = Depends(get_settings),
    adapter: OpenAIAdapter = Depends(get_adapter),
    mobile_api_key: str | None = Header(None, alias=MOBILE_API_HEADER),
):
    if req.tone not in TONE_STYLE:
        raise HTTPException(400, f"Invalid tone. Valid: {list(TONE_STYLE)}")

    configured_keys = _configured_mobile_keys(cfg)
    if not configured_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"reason": "mobile_disabled"},
        )
    if not mobile_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"reason": "missing_mobile_api_key"},
        )

    provided_key = mobile_api_key.strip()
    provided_hash = hashlib.sha256(provided_key.encode("utf-8")).hexdigest()
    if not any(
        _matches_mobile_key(provided_key, provided_hash, candidate)
        for candidate in configured_keys
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"reason": "invalid_mobile_api_key"},
        )

    # --- Lightweight rate limiting (shared with optional Redis backend) ---
    fwd = request.headers.get("x-forwarded-for") or request.headers.get(
        "X-Forwarded-For"
    )
    client_ip = (fwd.split(",")[0].strip() if fwd else None) or (
        request.client.host if request.client else None
    )
    bypass_ip_limit = os.getenv("MOBILE_SKIP_IP_LIMIT", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not bypass_ip_limit and not await allow_ip(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"reason": "rate_limited_ip", "retry": 60},
        )
    if not await allow_token(provided_hash):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"reason": "rate_limited_token", "retry": 60},
        )

    mobile_identity = f"mobile:{provided_hash[:16]}"
    result = await generate_poem(
        cfg,
        adapter,
        req.tone,
        req.timezone,
        req.format,
        bool(req.forceNew),
        bg,
    )

    # Ensure we have a stable request id for downstream logging/usage tracking
    request_id = result.get("request_id") or f"pv_{uuid.uuid4().hex[:12]}"
    result.setdefault("request_id", request_id)

    try:
        bg.add_task(record_usage_minute, mobile_identity, None, request_id)
    except Exception:
        pass

    try:
        bg.add_task(
            write_event,
            {
                "status": "ok",
                "model": result.get("model"),
                "tone": req.tone,
                "timezone": req.timezone,
                "user_id": mobile_identity,
                "request_id": request_id,
                "auth_provider_id": "mobile",
            },
        )
    except Exception:
        pass

    return result
