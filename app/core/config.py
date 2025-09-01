# app/core/config.py
import os, json
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
    EXPERIMENT_MODE: str = "single"   # single | ab | shadow
    AB_SPLIT: int = 20
    SHADOW_TARGETS: List[str] = field(default_factory=list)
    DAILY_COST_LIMIT_USD: float = 0.5
    CORS_ORIGINS: List[str] = field(default_factory=lambda: ["*"])

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

    return Settings(
        OPENAI_API_KEY=key.strip(),
        PRIMARY_MODEL=_get("PRIMARY_MODEL", "gpt-5").strip(),
        SECONDARY_MODEL=_get("SECONDARY_MODEL", "gpt-5-mini").strip(),
        TERTIARY_MODEL=_get("TERTIARY_MODEL", "gpt-5-nano").strip(),
        EXPERIMENT_MODE=_get("EXPERIMENT_MODE", "single").strip(),
        AB_SPLIT=ab_split,
        SHADOW_TARGETS=_get_list("SHADOW_TARGETS", []),
        DAILY_COST_LIMIT_USD=daily_cap,
        CORS_ORIGINS=_get_list("CORS_ORIGINS", ["*"])
    )