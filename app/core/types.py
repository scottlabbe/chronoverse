from pydantic import BaseModel
from typing import Literal, Optional, Any, Dict

Tone = Literal[
    "Whimsical", "Stoic", "Wistful", "Funny", "Haiku", "Noir", "Minimal", "Cosmic"
]


class PoemRequest(BaseModel):
    tone: Tone = "Stoic"
    timezone: str = "America/Chicago"  # client IANA tz
    format: Literal["12h", "24h", "auto"] = "auto"
    locale: str = "en-US"
    forceNew: bool = False  # bypass minute-cache


class PoemResponse(BaseModel):
    poem: str
    model: Optional[str] = None
    generated_at_iso: Optional[str] = None
    time_used: Optional[str] = None
    timezone: Optional[str] = None
    tone: Optional[Tone] = None
    daypart: Optional[str] = None
    cached: bool = False
    status: Literal["ok", "fallback", "error"] = "ok"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0
    request_id: Optional[str] = None
    response_id: Optional[str] = None
    retry_count: int = 0
    params_used: Optional[Dict[str, Any]] = None
    latency_ms: Optional[int] = None
