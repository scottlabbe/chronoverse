# Pricing helpers: dotenv-loaded env, env-safe keys, warnings, and startup validation
import os
import logging
import re
from dotenv import load_dotenv

load_dotenv()  # ensure .env variables are present in process env for os.getenv lookups

log = logging.getLogger("pricing")


def _env_candidates(model: str, kind: str) -> list[str]:
    """
    Build candidate environment variable names for a model and price kind.
    kind: "PROMPT" or "COMPLETION"
    Tries both ENV-safe uppercase (non-alnum -> '_') and a backward-compatible hyphenated form.
    """
    env_safe = re.sub(
        r"[^A-Za-z0-9]+", "_", model
    ).upper()  # e.g., gpt-5-mini -> GPT_5_MINI
    return [
        f"PRICE_{kind}_{env_safe}",  # preferred key
        f"PRICE_{kind}_{model}",  # fallback for existing hyphenated keys
    ]


def _price_for(model: str, kind: str) -> float | None:
    for key in _env_candidates(model, kind):
        raw = os.getenv(key, "").strip()
        if raw != "":
            try:
                return float(raw)
            except ValueError:
                log.warning("Invalid price value for %s=%r; ignoring", key, raw)
    return None


def get_prices(model: str) -> tuple[float, float]:
    p_in = _price_for(model, "PROMPT")
    p_out = _price_for(model, "COMPLETION")
    if p_in is None or p_out is None:
        log.warning(
            "Missing price for model %s (in=%r, out=%r). Costs will compute as 0.0.",
            model,
            p_in,
            p_out,
        )
    return (p_in or 0.0, p_out or 0.0)


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    p_in, p_out = get_prices(model)
    return round(
        (prompt_tokens / 1_000_000.0) * p_in
        + (completion_tokens / 1_000_000.0) * p_out,
        6,
    )


def has_prices(model: str) -> bool:
    return (_price_for(model, "PROMPT") is not None) and (
        _price_for(model, "COMPLETION") is not None
    )


def validate_prices(settings) -> None:
    """
    Fail fast if required price env vars are missing for active models.
    Active set includes:
      - PRIMARY_MODEL
      - SECONDARY_MODEL when EXPERIMENT_MODE=ab
      - all SHADOW_TARGETS when EXPERIMENT_MODE=shadow
    """
    active = {getattr(settings, "PRIMARY_MODEL", "")}
    mode = getattr(settings, "EXPERIMENT_MODE", "single")
    if mode == "ab":
        active.add(getattr(settings, "SECONDARY_MODEL", ""))
    if mode == "shadow":
        for m in getattr(settings, "SHADOW_TARGETS", []) or []:
            if m:
                active.add(m)
    missing = sorted(m for m in active if m and not has_prices(m))
    if missing:
        raise RuntimeError(
            "Missing PRICE_PROMPT_/PRICE_COMPLETION_ env vars for: "
            + ", ".join(missing)
            + ". Define either ENV-safe keys (e.g., PRICE_PROMPT_GPT_5_MINI) or hyphenated keys (PRICE_PROMPT_gpt-5-mini) in your .env."
        )
