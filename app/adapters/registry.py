from typing import Protocol
import os, logging, time
from openai import AsyncOpenAI, BadRequestError

log = logging.getLogger("adapter")

class LLMResult:  # tiny container
    def __init__(self, text: str, prompt_tokens: int, completion_tokens: int, model: str):
        self.text = text
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.model = model
        # optional telemetry that upstream can read if desired
        self.reasoning_tokens = 0
        self.retry_count = 0
        self.params_used = {}
        self.response_id = None
        self.latency_ms = None

class LLMAdapter(Protocol):
    async def generate(self, model: str, prompt: str, temperature: float = 0.8, max_tokens: int = 90) -> LLMResult: ...


def _is_gpt5(model: str) -> bool:
    return model.startswith("gpt-5")


class OpenAIAdapter:
    def __init__(self, api_key: str):
        self._client = AsyncOpenAI(api_key=api_key)

    async def generate(self, model: str, prompt: str, temperature: float = 0.8, max_tokens: int = 90) -> LLMResult:
        """Generate text using OpenAI Responses API with model-aware parameter shaping.
        - GPT-5 family: omit classic sampling knobs; include verbosity/reasoning controls.
        - Other models: allow temperature.
        - One-shot retry if API rejects an unsupported parameter (e.g., temperature).
        """
        kwargs = {"model": model, "input": prompt, "max_output_tokens": max_tokens}
        params_used = {}

        if _is_gpt5(model):
            # GPT-5 controls (env-tunable, with sensible defaults for short poems)
            verbosity = os.getenv("VERBOSITY", "low")
            effort = os.getenv("REASONING_EFFORT", "minimal")
            # Hint the API to emit a final text message and keep it concise
            kwargs["text"] = {"verbosity": verbosity, "format": {"type": "text"}}
            kwargs["reasoning"] = {"effort": effort}
            params_used = {"verbosity": verbosity, "reasoning_effort": effort, "temperature": False}
        else:
            # Legacy/text models: temperature is fine
            kwargs["temperature"] = temperature
            params_used = {"temperature": temperature}

        retry_count = 0
        start = time.perf_counter()
        try:
            resp = await self._client.responses.create(**kwargs)
        except BadRequestError as e:
            msg = str(e)
            # If the model rejects temperature, strip it and retry once
            if ("Unsupported parameter" in msg or "is not supported" in msg) and "temperature" in msg and "temperature" in kwargs:
                kwargs.pop("temperature", None)
                params_used["temperature"] = False
                retry_count = 1
                resp = await self._client.responses.create(**kwargs)
            else:
                raise

        end = time.perf_counter()
        latency_ms = int((end - start) * 1000)

        usage = getattr(resp, "usage", {}) or {}

        def _u(name: str, default: int = 0) -> int:
            # tolerate both dict-like and attr-like usage objects
            try:
                val = getattr(usage, name)
                return int(val) if val is not None else default
            except Exception:
                try:
                    return int(usage.get(name, default)) if isinstance(usage, dict) else default
                except Exception:
                    return default

        pt = _u("input_tokens", _u("prompt_tokens", 0))
        ct = _u("output_tokens", _u("completion_tokens", 0))
        rt = _u("reasoning_tokens", 0)

        # Robust text extraction across possible Responses API shapes
        def _extract_text(resp_obj):
            # 1) Prefer the SDK convenience property
            t = getattr(resp_obj, "output_text", None)
            if isinstance(t, str) and t.strip():
                return t
            # 2) Iterate over `output[*].content[*].text(.value)` if present
            out = getattr(resp_obj, "output", None)
            if isinstance(out, list):
                for item in out:
                    content = getattr(item, "content", None)
                    if isinstance(content, list):
                        for block in content:
                            v = getattr(block, "text", None)
                            if isinstance(v, str) and v.strip():
                                return v
                            if v is not None:
                                val = getattr(v, "value", None)
                                if isinstance(val, str) and val.strip():
                                    return val
                            if isinstance(block, dict):
                                tv = block.get("text")
                                if isinstance(tv, str) and tv.strip():
                                    return tv
                                if isinstance(tv, dict):
                                    vv = tv.get("value")
                                    if isinstance(vv, str) and vv.strip():
                                        return vv
            # 3) Some SDK shapes put items under `data`
            data = getattr(resp_obj, "data", None)
            if isinstance(data, list):
                for item in data:
                    content = getattr(item, "content", None)
                    if isinstance(content, list):
                        for block in content:
                            v = getattr(block, "text", None)
                            if isinstance(v, str) and v.strip():
                                return v
                            if v is not None:
                                val = getattr(v, "value", None)
                                if isinstance(val, str) and val.strip():
                                    return val
                            if isinstance(block, dict):
                                tv = block.get("text")
                                if isinstance(tv, str) and tv.strip():
                                    return tv
                                if isinstance(tv, dict):
                                    vv = tv.get("value")
                                    if isinstance(vv, str) and vv.strip():
                                        return vv
            return ""

        text = _extract_text(resp)
        if not text:
            log.warning(
                "adapter.extract_text.empty output_text=%s output_type=%s data_type=%s",
                bool(getattr(resp, "output_text", None)),
                type(getattr(resp, "output", None)).__name__ if getattr(resp, "output", None) is not None else "None",
                type(getattr(resp, "data", None)).__name__ if getattr(resp, "data", None) is not None else "None",
            )

        result = LLMResult((text or "").strip(), int(pt), int(ct), model)
        result.reasoning_tokens = int(rt)
        result.retry_count = retry_count
        result.params_used = params_used
        result.response_id = getattr(resp, "id", None)
        result.latency_ms = latency_ms
        return result