# app/core/config.py
import os
import json
from dataclasses import dataclass, field
from typing import List
from dotenv import load_dotenv

# Load .env into process environment early
load_dotenv()


def _get(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    return v if v is not None else default


def _get_list(name: str, default_list: List[str]) -> List[str]:
    raw = os.getenv(name)
    if raw is None:
        return list(default_list)
    s = raw.strip()
    # Try JSON first
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except Exception:
            pass
    # Fallback to CSV
    return [x.strip() for x in s.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    OPENAI_API_KEY: str
    PRIMARY_MODEL: str = "gpt-5"
    SECONDARY_MODEL: str = "gpt-5-mini"
    TERTIARY_MODEL: str = "gpt-5-nano"
    EXPERIMENT_MODE: str = "single"  # single | ab | shadow
    AB_SPLIT: int = 20
    SHADOW_TARGETS: List[str] = field(default_factory=list)
    DAILY_COST_LIMIT_USD: float = 0.5
    CORS_ORIGINS: List[str] = field(default_factory=lambda: ["*"])
    FREE_MINUTES: int = 180
    UPGRADE_PATH: str = "/api/billing/checkout"
    MOBILE_API_KEYS: List[str] = field(default_factory=list)
    MOBILE_RL_PER_MIN: int = 60
    # Stripe (server-side)
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    PRICE_ID: str | None = None
    PUBLIC_BASE_URL: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PORTAL_CONFIGURATION_ID: str | None = None
    # SMTP (feedback email)
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None
    FEEDBACK_TO: str | None = None


def get_settings() -> Settings:
    key = _get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is required in .env")
    try:
        ab_split = int(float(_get("AB_SPLIT", "20") or 20))
    except Exception:
        ab_split = 20
    try:
        daily_cap = float(_get("DAILY_COST_LIMIT_USD", "0.5") or 0.5)
    except Exception:
        daily_cap = 0.5
    try:
        free_minutes = int(float(_get("FREE_MINUTES", "180") or 180))
    except Exception:
        free_minutes = 180
    try:
        mobile_rl = int(float(_get("MOBILE_RL_PER_MIN", "60") or 60))
    except Exception:
        mobile_rl = 60
    upgrade_path = (
        _get("UPGRADE_PATH", "/api/billing/checkout") or "/api/billing/checkout"
    ).strip()
    mobile_keys = _get_list("MOBILE_API_KEYS", [])

    return Settings(
        OPENAI_API_KEY=key.strip(),
        PRIMARY_MODEL=_get("PRIMARY_MODEL", "gpt-5").strip(),
        SECONDARY_MODEL=_get("SECONDARY_MODEL", "gpt-5-mini").strip(),
        TERTIARY_MODEL=_get("TERTIARY_MODEL", "gpt-5-nano").strip(),
        EXPERIMENT_MODE=_get("EXPERIMENT_MODE", "single").strip(),
        AB_SPLIT=ab_split,
        SHADOW_TARGETS=_get_list("SHADOW_TARGETS", []),
        DAILY_COST_LIMIT_USD=daily_cap,
        CORS_ORIGINS=_get_list("CORS_ORIGINS", ["*"]),
        FREE_MINUTES=free_minutes,
        UPGRADE_PATH=upgrade_path,
        MOBILE_API_KEYS=mobile_keys,
        MOBILE_RL_PER_MIN=mobile_rl,
        STRIPE_SECRET_KEY=_get("STRIPE_SECRET_KEY"),
        STRIPE_PUBLISHABLE_KEY=_get("STRIPE_PUBLISHABLE_KEY"),
        PRICE_ID=_get("PRICE_ID"),
        PUBLIC_BASE_URL=_get("PUBLIC_BASE_URL"),
        STRIPE_WEBHOOK_SECRET=_get("STRIPE_WEBHOOK_SECRET"),
        STRIPE_PORTAL_CONFIGURATION_ID=_get("STRIPE_PORTAL_CONFIGURATION_ID"),
        SMTP_HOST=_get("SMTP_HOST"),
        SMTP_PORT=(int(float(_get("SMTP_PORT", "0") or 0)) if _get("SMTP_PORT") else None),
        SMTP_USER=_get("SMTP_USER"),
        SMTP_PASSWORD=_get("SMTP_PASSWORD"),
        SMTP_FROM=_get("SMTP_FROM") or _get("SMTP_USER"),
        FEEDBACK_TO=_get("FEEDBACK_TO") or "scottlabbe123@gmail.com",
    )
