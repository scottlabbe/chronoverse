import os
import time
import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol

from openai import AsyncOpenAI, BadRequestError

log = logging.getLogger("adapter")


# ---------------------------
# Result type returned to callers
# ---------------------------
@dataclass
class LLMResult:
    text: str
    model: str
    response_id: Optional[str]
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    latency_ms: int
    retry_count: int
    params_used: Dict[str, Any]
    raw: Any


# ---------------------------
# Adapter protocol (for typing)
# ---------------------------
class Adapter(Protocol):
    async def generate(self, model: str, prompt: str, max_tokens: int, temperature: Optional[float] = None) -> LLMResult: ...


# ---------------------------
# Helpers
# ---------------------------

def _is_gpt5(model: str) -> bool:
    return model.startswith("gpt-5")


def _extract_text(resp_obj):
    """
    Extract text from OpenAI Responses API response.
    Handles multiple response formats including GPT-5's reasoning + message structure.
    """
    # 1) SDK convenience property (highest priority)
    t = getattr(resp_obj, "output_text", None)
    if isinstance(t, str) and t.strip():
        return t

    fragments = []  # collect as last-resort join

    def _val_attr(obj, attr):
        """Extract value from attribute, handling nested .value property."""
        try:
            v = getattr(obj, attr, None)
            if isinstance(v, str) and v.strip():
                return v
            vv = getattr(v, "value", None)
            if isinstance(vv, str) and vv.strip():
                return vv
        except Exception:
            pass
        return None

    def _val_dict(d, key):
        """Extract value from dict, handling nested value key."""
        try:
            v = d.get(key)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, dict):
                vv = v.get("value")
                if isinstance(vv, str) and vv.strip():
                    return vv
        except Exception:
            pass
        return None

    def _scan_blocks(blocks):
        """Scan content blocks for text."""
        for b in blocks:
            # Check output_text first (GPT-5 preference)
            s = _val_attr(b, "output_text")
            if s:
                return s
            
            # Then check text field
            s = _val_attr(b, "text")
            if s:
                return s
            
            # Dict-based blocks
            if isinstance(b, dict):
                # Check for type field - might be the actual message
                if b.get("type") == "output_text":
                    # The text might be in value or directly in text key
                    s = _val_dict(b, "value") or _val_dict(b, "text") or b.get("value") or b.get("text")
                    if isinstance(s, str) and s.strip():
                        return s
                
                s = _val_dict(b, "output_text") or _val_dict(b, "text")
                if s:
                    return s
                # Nested summary inside a block (seen on some GPT-5 shapes)
                if "summary" in b:
                    sm = b["summary"]
                    if isinstance(sm, dict):
                        sv = sm.get("output_text") or sm.get("text")
                        if isinstance(sv, dict):
                            sv = sv.get("value")
                        if isinstance(sv, str) and sv.strip():
                            return sv
            
            # Last resort: raw string blocks
            if isinstance(b, str) and b.strip():
                fragments.append(b.strip())
        return None

    def _scan_item(item, allow_reasoning=False):
        """Scan a single output item for text content."""
        # Check item type
        item_type = getattr(item, "type", None)
        if item_type is None and isinstance(item, dict):
            item_type = item.get("type")
        
        # For reasoning items, check content array (GPT-5 might put message there)
        if item_type == "reasoning" and not allow_reasoning:
            # Special case: GPT-5 might put the actual message in reasoning.content
            content = getattr(item, "content", None)
            if content is None and isinstance(item, dict):
                content = item.get("content")
            
            if isinstance(content, list) and content:
                # Scan the content blocks within reasoning
                for block in content:
                    # Check if block is actually a message
                    block_type = None
                    if hasattr(block, "type"):
                        block_type = getattr(block, "type")
                    elif isinstance(block, dict):
                        block_type = block.get("type")
                    
                    # If we find an output_text type block, that's our text
                    if block_type in ("output_text", "text", "message"):
                        if isinstance(block, dict):
                            s = _val_dict(block, "value") or _val_dict(block, "text") or block.get("value") or block.get("text")
                            if isinstance(s, str) and s.strip():
                                return s
                        else:
                            s = _val_attr(block, "value") or _val_attr(block, "text")
                            if s:
                                return s
                
                # Try scanning all blocks normally
                s = _scan_blocks(content)
                if s:
                    return s
            
            # If still no text and we're desperate, try scanning reasoning item fully
            if allow_reasoning:
                # Continue to scan the reasoning item normally
                pass
            else:
                return None  # Skip further processing of reasoning items
        
        # Item-level text fields (direct on the item)
        s = _val_attr(item, "output_text")
        if s:
            return s
        s = _val_attr(item, "text")
        if s:
            return s

        # Summary-level text (common in GPT-5 reasoning/message items)
        summary = getattr(item, "summary", None)
        if summary is None and isinstance(item, dict):
            summary = item.get("summary")
        if summary is not None:
            s = _val_attr(summary, "output_text") or _val_attr(summary, "text")
            if s:
                return s
            if isinstance(summary, dict):
                s = _val_dict(summary, "output_text") or _val_dict(summary, "text") or summary.get("value")
                if isinstance(s, str) and s.strip():
                    return s

        # Message-level container
        m = getattr(item, "message", None)
        if m is None and isinstance(item, dict):
            m = item.get("message")
        if m is not None:
            s = _val_attr(m, "output_text") or _val_attr(m, "text")
            if s:
                return s
            if isinstance(m, dict):
                s = _val_dict(m, "output_text") or _val_dict(m, "text")
                if s:
                    return s
            m_content = getattr(m, "content", None) if not isinstance(m, dict) else m.get("content")
            if isinstance(m_content, list):
                s = _scan_blocks(m_content)
                if s:
                    return s
            elif isinstance(m_content, str) and m_content.strip():
                return m_content.strip()

        # Content array on the item
        content = getattr(item, "content", None)
        if content is None and isinstance(item, dict):
            content = item.get("content")
        
        if isinstance(content, list):
            s = _scan_blocks(content)
            if s:
                return s
        elif isinstance(content, str) and content.strip():
            return content.strip()

        # Dict-based items - check root level fields
        if isinstance(item, dict):
            s = _val_dict(item, "output_text") or _val_dict(item, "text")
            if s:
                return s

        return None

    # 2) Iterate over ALL output items
    out = getattr(resp_obj, "output", None)
    if isinstance(out, list) and out:
        # First pass: try all items normally (including special reasoning handling)
        for it in out:
            s = _scan_item(it, allow_reasoning=False)
            if s:
                return s
        
        # Second pass: if desperate, allow full reasoning scan
        for it in out:
            s = _scan_item(it, allow_reasoning=True)
            if s:
                return s

    # 3) Some SDK shapes put items under `data`
    data = getattr(resp_obj, "data", None)
    if isinstance(data, list) and data:
        for it in data:
            s = _scan_item(it, allow_reasoning=False)
            if s:
                return s
        # Desperate second pass
        for it in data:
            s = _scan_item(it, allow_reasoning=True)
            if s:
                return s

    # 4) If we collected fragments, join them as a last resort
    if fragments:
        return "\n".join(fragments)

    return ""


def enhanced_debug_peek(resp):
    """Enhanced debugging to see exactly what's in the response."""
    try:
        out = getattr(resp, "output", None)
        if isinstance(out, list):
            peek = {"total_items": len(out), "items": []}
            
            for i, item in enumerate(out):
                item_info = {"index": i}
                
                # Get type
                item_info["type"] = getattr(item, "type", None)
                if item_info["type"] is None and isinstance(item, dict):
                    item_info["type"] = item.get("type")
                
                # Get all keys
                if hasattr(item, "model_dump"):
                    d = item.model_dump()
                    item_info["keys"] = list(d.keys())

                    # Check for summary at item level
                    if "summary" in d:
                        sm = d["summary"]
                        item_info["summary_present"] = True
                        if isinstance(sm, dict):
                            item_info["summary_keys"] = list(sm.keys())
                            # Try to preview text from summary
                            sv = sm.get("text") or sm.get("output_text") or sm.get("value")
                            if isinstance(sv, dict):
                                sv = sv.get("value")
                            if isinstance(sv, str):
                                item_info["summary_preview"] = sv[:50] + "..." if len(sv) > 50 else sv

                    # Deep dive into content
                    if "content" in d and d["content"]:
                        content = d["content"]
                        if isinstance(content, list):
                            item_info["content_count"] = len(content)
                            item_info["content_items"] = []
                            for j, c in enumerate(content[:3]):  # First 3 items
                                c_info = {"index": j}
                                if isinstance(c, dict):
                                    c_info["keys"] = list(c.keys())
                                    c_info["type"] = c.get("type")
                                    # Check for text fields
                                    if "text" in c:
                                        t = c["text"]
                                        if isinstance(t, str):
                                            c_info["text_preview"] = t[:50] + "..." if len(t) > 50 else t
                                        elif isinstance(t, dict):
                                            c_info["text_keys"] = list(t.keys())
                                            if "value" in t:
                                                v = t["value"]
                                                if isinstance(v, str):
                                                    c_info["text_value_preview"] = v[:50] + "..." if len(v) > 50 else v
                                    if "output_text" in c:
                                        ot = c["output_text"]
                                        if isinstance(ot, str):
                                            c_info["output_text_preview"] = ot[:50] + "..." if len(ot) > 50 else ot
                                        elif isinstance(ot, dict):
                                            c_info["output_text_keys"] = list(ot.keys())
                                            if "value" in ot:
                                                v = ot["value"]
                                                if isinstance(v, str):
                                                    c_info["output_text_value_preview"] = v[:50] + "..." if len(v) > 50 else v
                                    # Check value field directly
                                    if "value" in c:
                                        v = c["value"]
                                        if isinstance(v, str):
                                            c_info["value_preview"] = v[:50] + "..." if len(v) > 50 else v
                                else:
                                    c_info["type"] = type(c).__name__
                                item_info["content_items"].append(c_info)
                        elif isinstance(content, str):
                            item_info["content_type"] = "string"
                            item_info["content_preview"] = content[:100] + "..." if len(content) > 100 else content
                        else:
                            item_info["content_type"] = type(content).__name__

                    # Check for output_text at item level
                    if "output_text" in d:
                        ot = d["output_text"]
                        if isinstance(ot, str) and ot:
                            item_info["item_output_text"] = ot[:50] + "..." if len(ot) > 50 else ot
                        elif isinstance(ot, dict):
                            item_info["item_output_text_keys"] = list(ot.keys())
                
                elif isinstance(item, dict):
                    item_info["keys"] = list(item.keys())
                    # Similar deep dive for dict items...
                
                peek["items"].append(item_info)
            
            return peek
        return None
    except Exception as ex:
        return {"error": str(ex)}


# ---------------------------
# Concrete adapter
# ---------------------------
class OpenAIAdapter:
    def __init__(self, client: Optional[AsyncOpenAI] = None, api_key: Optional[str] = None):
        # Prefer an injected client (useful for tests); otherwise construct here.
        # If an explicit API key is provided, use it; else the SDK will read from env.
        if client is not None:
            self._client = client
        else:
            if api_key:
                self._client = AsyncOpenAI(api_key=api_key)
            else:
                self._client = AsyncOpenAI()

    async def generate(self, model: str, prompt: str, max_tokens: int, temperature: Optional[float] = None) -> LLMResult:
        kwargs: Dict[str, Any] = {
            "model": model,
            "input": prompt,
            "max_output_tokens": max_tokens,
        }
        params_used: Dict[str, Any] = {"temperature": False}

        if _is_gpt5(model):
            # GPT-5 controls (env-tunable, validated)
            raw_v = (os.getenv("VERBOSITY", "low") or "").strip().lower()
            raw_e = (os.getenv("REASONING_EFFORT", "low") or "").strip().lower()
            allowed_v = {"low", "medium", "high"}
            allowed_e = {"minimal", "low", "medium", "high"}

            text_cfg: Dict[str, Any] = {"format": {"type": "text"}}
            if raw_v in allowed_v:
                text_cfg["verbosity"] = raw_v
                params_used["verbosity"] = raw_v
            kwargs["text"] = text_cfg

            if raw_e in allowed_e:
                kwargs["reasoning"] = {"effort": raw_e}
                params_used["reasoning_effort"] = raw_e
        else:
            if temperature is not None:
                kwargs["temperature"] = temperature
                params_used["temperature"] = temperature

        t0 = time.perf_counter()
        retry_count = 0

        try:
            resp = await self._client.responses.create(**kwargs)
        except BadRequestError as e:
            msg = str(e)
            # Strip unsupported knobs and retry once
            if ("Unsupported parameter" in msg or "is not supported" in msg):
                if "temperature" in msg and "temperature" in kwargs:
                    kwargs.pop("temperature", None)
                    params_used["temperature"] = False
                    retry_count = 1
                    resp = await self._client.responses.create(**kwargs)
                elif ("text" in msg or "verbosity" in msg) and "text" in kwargs:
                    kwargs.pop("text", None)
                    params_used.pop("verbosity", None)
                    retry_count = 1
                    resp = await self._client.responses.create(**kwargs)
                elif ("reasoning" in msg or "effort" in msg) and "reasoning" in kwargs:
                    kwargs.pop("reasoning", None)
                    params_used.pop("reasoning_effort", None)
                    retry_count = 1
                    resp = await self._client.responses.create(**kwargs)
                else:
                    raise
            else:
                raise

        # Extract text
        text = _extract_text(resp)
        if not text:
            # Enhanced debugging
            if (os.getenv("ADAPTER_DEBUG", "0").strip().lower() in ("1", "true", "yes", "on")):
                peek = enhanced_debug_peek(resp)
                if peek:
                    import json
                    log.warning("adapter.peek DETAILED structure: %s", json.dumps(peek, indent=2))
            
            log.warning(
                "adapter.extract_text.empty output_text=%s output_type=%s data_type=%s",
                bool(getattr(resp, "output_text", None)),
                type(getattr(resp, "output", None)).__name__ if getattr(resp, "output", None) is not None else "None",
                type(getattr(resp, "data", None)).__name__ if getattr(resp, "data", None) is not None else "None",
            )

        # Usage & metadata
        u = getattr(resp, "usage", None)
        def _gi(obj, *names):
            for n in names:
                try:
                    v = getattr(obj, n)
                    if isinstance(v, (int, float)):
                        return int(v)
                except Exception:
                    pass
            return 0

        prompt_tokens = _gi(u, "input_tokens", "prompt_tokens") if u else 0
        completion_tokens = _gi(u, "output_tokens", "completion_tokens") if u else 0
        reasoning_tokens = _gi(u, "reasoning_tokens") if u else 0
        response_id = getattr(resp, "id", None) or getattr(resp, "response_id", None)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        return LLMResult(
            text=text or "",
            model=model,
            response_id=response_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reasoning_tokens=reasoning_tokens,
            latency_ms=latency_ms,
            retry_count=retry_count,
            params_used=params_used,
            raw=resp,
        )