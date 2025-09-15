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
from app.services.rate_limit import allow_user, allow_ip

import uuid
from app.data.events import record_usage_minute, monthly_usage_minutes, write_event
from app.data.subscriptions import is_subscribed

router = APIRouter(prefix="/api")


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
