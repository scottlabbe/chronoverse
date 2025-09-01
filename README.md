Awesome—here’s a clear, comprehensive README you can drop in at the project root. It captures the important functions, DB, and overall structure, and it reflects the choices you’ve made (simple experiments, no extra telemetry stored, flexible time wording).

---

# ChronoVerse

A minimalist web app that serves a tiny poem about *now*. Each poem weaves the current time into <3 lines, with user-selectable tone and clean typography. Backend is FastAPI + OpenAI’s Responses API.

## ✨ What it does

- Generates a short poem that includes the current time (digits or words).
- Lets the caller choose a **tone** (Whimsical, Stoic, Wistful, Funny, Haiku, Noir, Minimal, Cosmic).
- Supports multiple models (GPT-5 family and others).
- Caches by **minute** to avoid duplicate calls.
- Tracks cost and enforces a **daily budget cap**.
- Returns a **graceful fallback poem** if a model call fails or returns empty.

---

## 🧱 Architecture at a glance

- **FastAPI** app with a small service layer (`poem_service.py`)
- **Adapter** that’s *model-aware* (GPT-5 vs non-GPT-5) and calls the OpenAI **Responses API**
- **Pricing** utility to compute cost from usage
- **In-memory cache** with 60s freshness
- **SQLite** for event logging (baseline fields only; you chose not to persist extra telemetry)

---

## 📁 Directory layout (key files)

```
chronoverse/
├─ app/
│  ├─ main.py                     # FastAPI app & route wiring (/healthz, /api/poem)
│  ├─ core/
│  │  ├─ config.py                # .env loader (simple, robust)
│  │  └─ types.py                 # Pydantic models (PoemRequest/PoemResponse, Tone enum)
│  ├─ services/
│  │  ├─ poem_service.py          # time_str, make_prompt, choose_model, generate_poem
│  │  ├─ pricing.py               # cost_usd(), price validation
│  │  └─ cache.py                 # minute-level in-memory cache
│  ├─ adapters/
│  │  └─ registry.py              # OpenAIAdapter (Responses API, GPT-5 policy, extraction)
│  └─ data/
│     └─ events.py                # today_cost_sum(), write_event() → SQLite
├─ data/
│  └─ events.db                   # SQLite file (created at runtime)
├─ .env                           # Project config (do not commit)
├─ .env.example                   # Template for env vars
├─ requirements.txt
└─ README.md
```

---

## 🔑 Important modules & functions

### `app/services/poem_service.py`
- `time_str(tz:str, fmt:str) -> str`  
  Formats current time in the given IANA timezone (e.g., `America/Chicago`) as **24h** (`%H:%M`) or **12h** (`%-I:%M %p`, Windows-safe fallback). Used only to **compute** time; we strip AM/PM before prompting.

- `make_prompt(time_used:str, tone:Tone) -> str`  
  Structured, concise prompt (INPUT/RULES/OUTPUT). Key rules:
  - Include the time **once**, number **or** words (your choice).
  - Under 3 lines (Haiku: exactly 3 lines, 5/7/5).
  - No time zones, cities, dates, AM/PM, emojis, titles; **poem only**.

- `choose_model(cfg:Settings, req_id:str) -> str`  
  Routes requests based on experiment mode:
  - `single`: always **PRIMARY_MODEL**  
  - `ab`: `%` split to **SECONDARY_MODEL** (deterministic hash)  
  - `shadow`: user still sees primary; others run in background (you’re not using this now)

- `generate_poem(cfg, adapter, tone, tz, fmt, force_new, bg=None) -> dict`  
  Orchestrates:
  1) Budget guard via `today_cost_sum()`  
  2) Minute cache (primary responses only; bypass with `forceNew=true`)  
  3) Prompt build (strips AM/PM before prompting)  
  4) Calls adapter; if **text is empty**, returns fallback poem (no crash)  
  5) Computes cost via `pricing.cost_usd()`  
  6) Writes a baseline event (you’re not persisting extra telemetry; see DB section)

### `app/adapters/registry.py`
- `OpenAIAdapter.generate(model, prompt, max_tokens)`  
  - **GPT-5 family** (`gpt-5*`):
    - Uses **Responses API** with `max_output_tokens`.
    - Sends `text={"format":{"type":"text"},"verbosity":ENV}` and `reasoning={"effort":ENV}`.
    - **Does not** send `temperature` (unsupported).
  - **Non-GPT-5** (e.g., `gpt-4o-mini`): uses classic sampling (temperature allowed).
  - One-shot retry if the API complains about an unsupported parameter.
  - Extracts text safely (prefers `output_text`, otherwise walks `output → content → text`).
  - Returns token usage; the service handles cost & caching.

### `app/services/pricing.py`
- Computes **cost (USD)** from `usage` and your price map.
- Supports hyphenated or ENV_SAFE price keys (e.g., `PRICE_PROMPT_gpt-5` or `PRICE_PROMPT_GPT_5`).

### `app/data/events.py`
- `today_cost_sum()` sums costs for the current UTC day to enforce `DAILY_COST_LIMIT_USD`.
- `write_event(payload)` inserts into SQLite; unknown keys can be ignored depending on implementation (we’re using baseline fields only).

---

## ⚙️ Setup & run

**Requirements**: Python 3.12+

```bash
# from project root
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt

# copy and edit env
cp .env.example .env
# put your actual OPENAI_API_KEY=... and other values

# run
uvicorn app.main:app --reload
# docs: http://127.0.0.1:8000/docs
```

---

## 🧩 Configuration (.env)

Required:
```
OPENAI_API_KEY=sk-...
```

Models & experiments:
```
PRIMARY_MODEL=gpt-5
SECONDARY_MODEL=gpt-5-mini
TERTIARY_MODEL=gpt-5-nano

EXPERIMENT_MODE=single      # single | ab | shadow
AB_SPLIT=20                 # % to SECONDARY when mode=ab
SHADOW_TARGETS=["gpt-5-mini","gpt-5-nano"]   # only used if mode=shadow
```

Model controls (GPT-5 family):
```
VERBOSITY=low               # low | medium | high
REASONING_EFFORT=minimal    # minimal | low | medium | high
MAX_OUTPUT_TOKENS=128       # recommended floor for reasoning models
```

App:
```
DAILY_COST_LIMIT_USD=0.50
CORS_ORIGINS=["*"]          # tighten for production
```

Pricing (per 1M tokens):
```
PRICE_PROMPT_gpt-5=1.25
PRICE_COMPLETION_gpt-5=10.00
PRICE_PROMPT_gpt-5-mini=0.25
PRICE_COMPLETION_gpt-5-mini=2.00
PRICE_PROMPT_gpt-5-nano=0.05
PRICE_COMPLETION_gpt-5-nano=0.40
```

> **Dotenv tips:** one `KEY=VALUE` per line; JSON arrays must be quoted (`["*"]`); no inline comments.

---

## 🔌 API

### `GET /healthz`
- Returns: `{"ok": true}`

### `POST /api/poem`
**Body**
```json
{
  "tone": "Stoic",                // one of Tone enum
  "timezone": "America/Chicago",  // IANA tz name (used only for computing local time)
  "format": "12h",                // "12h" or "24h"
  "forceNew": true                // bypass minute cache
}
```

**Response (fields you’ll see)**
```json
{
  "poem": "…",
  "model": "gpt-5",
  "generated_at_iso": "2025-08-30T16:20:20.773Z",
  "time_used": "10:20 AM",         // what the UI should display
  "tone": "Stoic",
  "cached": false,
  "status": "ok",                  // or "fallback"
  "prompt_tokens": 45,
  "completion_tokens": 22,
  "cost_usd": 0.0005,
  "request_id": "cv_ab12cd34ef56",
  "timezone": "America/Chicago"
  // telemetry exists in-memory but you're not persisting extra fields to DB
}
```

**Try it out**: `http://127.0.0.1:8000/docs` (Swagger UI)

**Curl example**
```bash
curl -s http://127.0.0.1:8000/api/poem \
  -H "Content-Type: application/json" \
  -d '{"tone":"Stoic","timezone":"America/Chicago","format":"12h","forceNew":true}'
```

---

## 🧠 Prompting behavior (what the model sees)

- Structured prompt with clear sections (INPUT → RULES → OUTPUT).
- Time is passed **without** AM/PM (we strip meridiem).
- The poem must include the time **once**, and can use digits **or** words (your preference).
- No time zones, cities, dates, emojis, or titles.

---

## 🧮 Caching & cost

- **Cache**: in-memory, 60-second freshness; key includes the **minute**, `tz`, `tone`, and **PRIMARY_MODEL**. Only **primary** success responses are cached. Use `"forceNew": true` to bypass.
- **Cost**: computed from `usage` and `.env` prices; `DAILY_COST_LIMIT_USD` enforces a hard cap and returns the fallback poem when exceeded.

---

## 🗃️ Database (events)

- SQLite at `data/events.db`
- **Baseline** fields (typical row):  
  `ts_iso` (write time), `request_id`, `status` (“ok”/“fallback”/“shadow”),  
  `model`, `tone`, `timezone`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `cached`.

> You chose **not to persist extra telemetry** (like `retry_count`, `params_used`, `reasoning_tokens`) for now. The writer will ignore unknown keys or you can trim before calling `write_event()`.

---

## 🧪 Experiments (optional)

- `single`: always **PRIMARY_MODEL** (recommended now).
- `ab`: route a % of requests to **SECONDARY_MODEL** (`AB_SPLIT`).
- `shadow`: users see **PRIMARY_MODEL**; other models run in background for logging/analysis.

---

## 🛠 Troubleshooting

- **400: Unsupported parameter `temperature`** (GPT-5)  
  → Adapter already avoids `temperature` for GPT-5. If you switch to a classic model, it’s allowed.

- **`python-dotenv could not parse …`**  
  → `.env` must be strict `KEY=VALUE`, JSON arrays quoted, no inline comments.

- **`{"detail":"Not Found"}` at `/`**  
  → Expected. We didn’t build a homepage; use `/docs` or `/api/poem`.

- **Empty poem after 200 OK**  
  → We request `text.format=type=text` and have a safety net; if it ever happens, you’ll get the fallback poem (no crash). Consider `MAX_OUTPUT_TOKENS>=128`.

---

## 🚀 Deploy notes

- Never commit `.env`. Use `.env.example` as a template.
- Set `CORS_ORIGINS` appropriately before sharing publicly.
- Consider pinning `openai` to a recent stable in `requirements.txt` to avoid SDK shape regressions.

---