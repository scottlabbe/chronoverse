import os, uuid, logging
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import BackgroundTasks
from app.core.config import Settings
from app.core.types import Tone
from app.adapters.registry import OpenAIAdapter, LLMResult
from app.services import cache, pricing
from app.services import micro_directives
from app.data import events as ev

log = logging.getLogger("poem")

TONE_STYLE = {
  "Whimsical":"light, playful metaphors; gentle alliteration",
  "Stoic":"calm, restrained, simple diction",
  "Wistful":"short, soft, nostalgia",
  "Funny":"wry, amusing humor",
  "Haiku":"write exactly 3 lines with 5/7/5 syllables inlcuding the time.",
  "Noir":"moody, cinematic; concrete imagery",
  "Minimal":"ultra-brief; no adjectives",
  "Cosmic":"space/time motifs; awe"
}

def time_str(tz: str, fmt: str) -> str:
    now = datetime.now(ZoneInfo(tz))
    if fmt == "24h":
        return now.strftime("%H:%M")
    # 12h format with platform-safe hour (Windows lacks %-I)
    if os.name == "nt":
        return now.strftime("%I:%M %p").lstrip("0")
    return now.strftime("%-I:%M %p")

def daypart_for(local_dt: datetime) -> str:
    """Map local hour:minute to a human daypart without using AM/PM tokens."""
    hm = local_dt.hour * 60 + local_dt.minute
    # Bands:
    # pre-dawn: 04:00–05:59
    # early morning: 06:00–07:59
    # morning: 08:00–11:29
    # midday: 11:30–13:29
    # afternoon: 13:30–16:59
    # evening: 17:00–20:29
    # late night: 20:30–03:59
    if 4 * 60 <= hm <= 5 * 60 + 59:
        return "pre-dawn"
    if 6 * 60 <= hm <= 7 * 60 + 59:
        return "early morning"
    if 8 * 60 <= hm <= 11 * 60 + 29:
        return "morning"
    if 11 * 60 + 30 <= hm <= 13 * 60 + 29:
        return "midday"
    if 13 * 60 + 30 <= hm <= 16 * 60 + 59:
        return "afternoon"
    if 17 * 60 <= hm <= 20 * 60 + 29:
        return "evening"
    return "late night"

def make_prompt(time_used: str, tone: Tone, daypart: str, extra_hint: str | None = None) -> str:
    style = TONE_STYLE[tone]
    return (
        "You are a Master Poet writing brief, time-aware poems.\n"
        "<<RULES>>\n"
        "- Write a short poem that includes the time exactly once.\n"
        "- Write the time anywhere in the poem (number or english form).\n"
        "- Length: ≤ 3 lines and <180 characters.\n"
        "- Voice: punchy, fun, accessible; prefer concrete images and active verbs.\n"
        "- Output the poem only.\n"
        "- Mind the input but it's optional to include in poem text.\n"

        f"<<INPUT>>\n"
        f"time: {time_used}\n"
        f"daypart: {daypart}\n"
        f"tone: {tone}\n"
        f"style: {style}\n"
        + (f"{extra_hint}\n" if extra_hint else "")

        + "<<OUTPUT>>\n"
    )

def choose_model(cfg: Settings, req_id: str) -> str:
    # 'single': always primary; 'ab': stable % to secondary; 'shadow': primary for user
    if cfg.EXPERIMENT_MODE == "single":
        return cfg.PRIMARY_MODEL
    if cfg.EXPERIMENT_MODE == "ab":
        bucket = (int(req_id[-4:], 16) % 100)
        return cfg.SECONDARY_MODEL if bucket < max(0, min(100, cfg.AB_SPLIT)) else cfg.PRIMARY_MODEL
    return cfg.PRIMARY_MODEL  # shadow

async def generate_poem(cfg: Settings, adapter: OpenAIAdapter, tone: Tone, tz: str, fmt: str,
                        force_new: bool, bg: BackgroundTasks | None = None) -> dict:

    async def _call_model(adapter: OpenAIAdapter, model: str, prompt: str) -> LLMResult:
        # Adapter is model-aware and will omit unsupported params for GPT-5.
        return await adapter.generate(model=model, prompt=prompt, max_tokens=500)

    req_id = f"cv_{uuid.uuid4().hex[:12]}"
    t_used = time_str(tz, "12h" if fmt not in ("12h","24h") else fmt)
    local_dt = datetime.now(ZoneInfo(tz))
    daypart = daypart_for(local_dt)
    minute_of_day = local_dt.hour * 60 + local_dt.minute
    extra_hint, directive_id = micro_directives.pick(minute_of_day, tone=str(tone), salt=req_id)

    # Budget check
    if ev.today_cost_sum() >= cfg.DAILY_COST_LIMIT_USD:
        poem = ("The clock ticks on, a steady, rhythmic chime,\nBut our quill must rest—budget keeps the time.")
        payload = {
            "poem": poem,
            "model": None,
            "generated_at_iso": datetime.now(timezone.utc).isoformat(),
            "time_used": t_used,
            "tone": tone,
            "cached": False,
            "status": "fallback",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "reasoning_tokens": 0,
            "cost_usd": 0.0,
            "request_id": req_id,
            "timezone": tz,
            "retry_count": 0,
            "params_used": None,
            "daypart": daypart,
            "response_id": None,
            "latency_ms": None,
            "directive_id": directive_id,
            "extra_hint": extra_hint,
        }
        ev.write_event(payload)
        return payload

    cache_key = f"{local_dt.strftime('%Y-%m-%dT%H:%M')}|{tz}|{tone}|{cfg.PRIMARY_MODEL}"
    if not force_new:
        cached = cache.get(cache_key)
        if cached: return {**cached, "cached":True}

    t_for_prompt = t_used.replace(" AM", "").replace(" PM", "").replace(" am", "").replace(" pm", "")
    prompt = make_prompt(t_for_prompt, tone, daypart, extra_hint=extra_hint)
    model_for_user = choose_model(cfg, req_id)

    try:
        # Primary response (for user)
        res = await _call_model(adapter, model_for_user, prompt)
        # Safety net: successful call but empty text → return fallback poem
        if not (getattr(res, "text", "") or "").strip():
            fallback = {
                "poem": "The clock ticks on, a steady, rhythmic chime,\nBut the muse of code is lost in space and time.\nIt tried to write a verse for you, it's true,\nBut the server sprites had other things to do.",
                "model": res.model if getattr(res, "model", None) else None,
                "generated_at_iso": datetime.now(timezone.utc).isoformat(),
                "time_used": t_used,
                "tone": tone,
                "cached": False,
                "status": "fallback",
                "prompt_tokens": getattr(res, "prompt_tokens", 0),
                "completion_tokens": getattr(res, "completion_tokens", 0),
                "reasoning_tokens": getattr(res, "reasoning_tokens", 0),
                "cost_usd": 0.0,
                "request_id": req_id,
                "timezone": tz,
                "retry_count": getattr(res, "retry_count", 0),
                "params_used": getattr(res, "params_used", None),
                "daypart": daypart,
                "response_id": getattr(res, "response_id", None),
                "latency_ms": getattr(res, "latency_ms", None),
                "directive_id": directive_id,
                "extra_hint": extra_hint,
            }
            ev.write_event(fallback)
            log.warning("empty_poem_from_model model=%s req_id=%s", model_for_user, req_id)
            return fallback

        retry_count = getattr(res, "retry_count", 0)
        params_used = getattr(res, "params_used", None)
        reasoning_tokens = getattr(res, "reasoning_tokens", 0)
        cost = pricing.cost_usd(res.model, res.prompt_tokens, res.completion_tokens)
        payload = {
            "poem": res.text,
            "model": res.model,
            "generated_at_iso": datetime.now(timezone.utc).isoformat(),
            "time_used": t_used,
            "tone": tone,
            "cached": False,
            "status": "ok",
            "prompt_tokens": res.prompt_tokens,
            "completion_tokens": res.completion_tokens,
            "reasoning_tokens": reasoning_tokens,
            "cost_usd": cost,
            "request_id": req_id,
            "timezone": tz,
            "retry_count": retry_count,
            "params_used": params_used,
            "daypart": daypart,
            "response_id": getattr(res, "response_id", None),
            "latency_ms": getattr(res, "latency_ms", None),
            "directive_id": directive_id,
            "extra_hint": extra_hint,
        }
        if res.model == cfg.PRIMARY_MODEL and payload.get("status") == "ok":
            cache.set(cache_key, payload)
        ev.write_event(payload)

        # Shadow mode: also call SECONDARY in background for logging-only
        if cfg.EXPERIMENT_MODE == "shadow" and bg and cfg.SHADOW_TARGETS:
            def _shadow(models: list[str], prompt: str, tz: str, tone: Tone, req_id: str):
                import asyncio
                async def run():
                    for m in models:
                        try:
                            sres = await _call_model(adapter, m, prompt)
                            scost = pricing.cost_usd(sres.model, sres.prompt_tokens, sres.completion_tokens)
                            ev.write_event({
                                "ts_iso": datetime.now(timezone.utc).isoformat(),
                                "request_id": req_id,
                                "status": "shadow",
                                "model": sres.model,
                                "tone": tone,
                                "timezone": tz,
                                "prompt_tokens": sres.prompt_tokens,
                                "completion_tokens": sres.completion_tokens,
                                "cost_usd": scost,
                                "cached": 0,
                                # extra telemetry (ignored by current schema but useful if/when extended)
                                "reasoning_tokens": getattr(sres, "reasoning_tokens", 0),
                                "retry_count": getattr(sres, "retry_count", 0),
                                "params_used": getattr(sres, "params_used", None),
                                "daypart": daypart,
                                "response_id": getattr(sres, "response_id", None),
                                "latency_ms": getattr(sres, "latency_ms", None),
                                "directive_id": directive_id,
                                "extra_hint": extra_hint,
                            })
                        except Exception:
                            pass
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(run())
                except RuntimeError:
                    asyncio.run(run())
            bg.add_task(_shadow, cfg.SHADOW_TARGETS, prompt, tz, tone, req_id)
        return payload
    except Exception as e:
        fallback = {
            "poem": "The clock ticks on, a steady, rhythmic chime,\nBut the muse of code is lost in space and time.\nIt tried to write a verse for you, it's true,\nBut the server sprites had other things to do.",
            "model": None,
            "generated_at_iso": datetime.now(timezone.utc).isoformat(),
            "time_used": t_used,
            "tone": tone,
            "cached": False,
            "status": "fallback",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "reasoning_tokens": 0,
            "cost_usd": 0.0,
            "request_id": req_id,
            "timezone": tz,
            "retry_count": 0,
            "params_used": None,
            "daypart": daypart,
            "response_id": None,
            "latency_ms": None,
            "directive_id": directive_id,
            "extra_hint": extra_hint,
        }
        ev.write_event(fallback); log.exception("model_error: %s", e)
        return fallback