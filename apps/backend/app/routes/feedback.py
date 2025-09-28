from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any, Dict
import datetime as dt
import smtplib
from email.message import EmailMessage
import socket
import logging
import os
from pathlib import Path

from app.core.config import Settings, get_settings
from app.data.events import write_feedback
from app.services.rate_limit import allow_user, allow_ip

router = APIRouter(prefix="/api")
log = logging.getLogger("feedback")


def _get_current_user(authorization: str | None = Header(None)):
    """Lazy import token verifier to avoid circular imports."""
    try:
        from app.main import verify_bearer_token  # type: ignore

        claims = verify_bearer_token(authorization)
        return {"user_id": claims.get("sub"), "email": claims.get("email")}
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


class FeedbackContext(BaseModel):
    tone: Optional[str] = None
    version: Optional[Literal["Gallery", "Manuscript", "Zen"]] = None
    theme: Optional[Literal["Paper", "Stone", "Ink", "Slate", "Mist"]] = None
    poem: Optional[str] = None
    timezone: Optional[str] = None
    format: Optional[Literal["12h", "24h", "auto"]] = None
    path: Optional[str] = None


class FeedbackRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    includeContext: bool = True
    context: Optional[FeedbackContext] = None


class FeedbackResponse(BaseModel):
    ok: bool
    emailed: bool
    logged: bool


def _send_email(cfg: Settings, to_addr: str, subject: str, body: str) -> bool:
    host = (cfg.SMTP_HOST or "").strip()
    port = cfg.SMTP_PORT or 0
    user = (cfg.SMTP_USER or "").strip()
    pwd = cfg.SMTP_PASSWORD or None
    from_addr = (cfg.SMTP_FROM or user or "").strip()

    if not (host and port and from_addr and to_addr):
        log.warning(
            "feedback_email_not_configured host=%r port=%r from=%r to=%r",
            bool(host), port, from_addr, to_addr,
        )
        return False

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
        server.ehlo()
        try:
            if port != 465:
                server.starttls()
        except Exception:
            # Some servers may not support STARTTLS; continue without if needed
            pass
        if user and pwd:
            server.login(user, pwd)

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg.set_content(body)
        server.send_message(msg)
        try:
            server.quit()
        except Exception:
            pass
        log.info(
            "feedback_email_sent to=%s from=%s bytes=%d",
            to_addr,
            from_addr,
            len(body.encode("utf-8", errors="ignore")),
        )
        return True
    except Exception as e:
        log.exception("feedback_email_send_failed: %s", e)
        return False


def _write_outbox_eml(to_addr: str, subject: str, body: str) -> str | None:
    """Write a .eml file to data/feedback_outbox as a fallback for local inspection."""
    try:
        outdir = Path("data/feedback_outbox")
        outdir.mkdir(parents=True, exist_ok=True)
        fname = f"feedback_{dt.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.eml"
        fpath = outdir / fname
        content = (
            f"To: {to_addr}\nSubject: {subject}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n" + body
        )
        fpath.write_text(content, encoding="utf-8")
        log.warning("feedback_email_outboxed path=%s", str(fpath))
        return str(fpath)
    except Exception:
        return None


@router.post("/feedback", response_model=FeedbackResponse)
async def post_feedback(
    req: FeedbackRequest,
    request: Request,
    cfg: Settings = Depends(get_settings),
    user: dict = Depends(_get_current_user),
):
    user_id = user.get("user_id")
    email = user.get("email")

    # Lightweight rate limit (user + IP)
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    client_ip = (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else None)
    if not await allow_ip(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"reason": "rate_limited_ip", "retry": 60},
        )
    if not await allow_user(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"reason": "rate_limited_user", "retry": 60},
        )

    # Prepare durable log first
    ua = request.headers.get("user-agent")
    path = str(request.url.path)
    ts_iso = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    context: Dict[str, Any] | None = req.context.model_dump() if (req.includeContext and req.context) else None

    write_feedback(
        {
            "ts_iso": ts_iso,
            "user_id": user_id,
            "email": email,
            "message": req.message.strip(),
            "include_context": bool(req.includeContext and context),
            "context": context,
            "user_agent": ua,
            "path": path,
            "ip": client_ip,
        }
    )

    # Compose email
    to_addr = (cfg.FEEDBACK_TO or "").strip()
    subject = "[The Present Verse] User feedback"
    lines = [
        f"Time: {ts_iso}",
        f"User: {user_id or 'unknown'}",
        f"Email: {email or 'unknown'}",
        f"IP: {client_ip or 'unknown'}",
        f"Path: {path}",
        f"UA: {ua or 'unknown'}",
        "",
        "Message:",
        req.message.strip(),
    ]
    if context:
        lines += [
            "",
            "Context:",
            f"tone={context.get('tone')}",
            f"version={context.get('version')}",
            f"theme={context.get('theme')}",
            f"timezone={context.get('timezone')}",
            f"format={context.get('format')}",
            f"path={context.get('path')}",
            "",
            "Poem:",
            (context.get("poem") or "").strip(),
        ]
    body = "\n".join(lines)

    emailed = _send_email(cfg, to_addr, subject, body)
    if not emailed:
        _write_outbox_eml(to_addr, subject, body)
    return FeedbackResponse(ok=True, emailed=emailed, logged=True)
