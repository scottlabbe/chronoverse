# ChronoVerse

Minimalist, living “time poems.” Each visit (or minute) generates a short poem that *includes the current time*, in a chosen tone, without AM/PM or timezone names. Built with FastAPI + Vite/React, powered by OpenAI GPT-5 models via the **Responses API**.

## ✨ Highlights

- **Clean UI** with big type and optional fullscreen “presentation mode”
- **Tones**: Whimsical, Stoic, Wistful, Funny, Haiku, Noir, Minimal, Cosmic
- **Prompt rules**: must include clock time, under 3 lines, no AM/PM, no timezone, style follows chosen tone
- **Daypart awareness**: early morning / morning / afternoon / evening / night / late night, injected as metadata (not literal AM/PM) to guide imagery
- **Minute auto-refresh** (default **ON**): new poem each minute, with jitter, pauses when tab hidden
- **Model switching**: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- **GPT-5 controls**: `text.verbosity`, `reasoning.effort` (Responses API)
- **Caching**: in-memory, per minute+tone
- **Logging**: SQLite events DB with full response snapshot in JSON for later analysis
- **Swagger UI**: interactive testing at `/docs`

---

## Project Structure

```
chronoverse/
├─ app/
│  ├─ main.py                  # FastAPI app factory & CORS
│  ├─ routes/
│  │  └─ poems.py              # POST /api/poem
│  ├─ services/
│  │  └─ poem_service.py       # prompt building, cache, orchestration, cost calc
│  ├─ adapters/
│  │  └─ registry.py           # OpenAI adapter (Responses API) + robust text extraction
│  ├─ core/
│  │  └─ config.py             # pydantic-settings
│  ├─ data/
│  │  ├─ events.py             # SQLite writes, schema
│  │  └─ events.db             # SQLite database (created at runtime)
│  └─ types/
│     └─ models.py             # Pydantic request/response types (PoemRequest/PoemResponse)
├─ web/
│  ├─ index.html
│  ├─ vite.config.ts
│  ├─ package.json
│  └─ src/
│     ├─ App.tsx               # UI, timer, fetch, tone selector, fullscreen button
│     ├─ api.ts                # client fetcher for /api/poem
│     └─ styles/
│        └─ globals.css        # responsive typography, full-bleed layout
├─ .env                        # environment variables (see below)
├─ requirements.txt
├─ .gitignore
└─ README.md
```

---

## Backend Overview

### Endpoint

```
POST /api/poem
```

**Request body** (JSON):
```json
{
  "tone": "Stoic",
  "timezone": "America/Chicago",
  "format": "12h",
  "forceNew": true
}
```

- `tone`: one of: Whimsical | Stoic | Wistful | Funny | Haiku | Noir | Minimal | Cosmic
- `timezone`: IANA tz string; we **do not** include timezone name in the poem
- `format`: "12h" or "24h"; the prompt logic **strips AM/PM** before sending to the model
- `forceNew`: skip cache for a fresh generation

**Response**:
```json
{
  "poem": "…",
  "model": "gpt-5-nano",
  "generated_at_iso": "2025-09-01T12:39:34.657032+00:00",
  "time_used": "7:39",
  "timezone": "America/Chicago",
  "tone": "Stoic",
  "daypart": "early morning",
  "cached": false,
  "status": "ok",
  "prompt_tokens": 146,
  "completion_tokens": 41,
  "reasoning_tokens": 0,
  "cost_usd": 0.000024,
  "request_id": "cv_xxx",
  "response_id": "resp_xxx",
  "retry_count": 0,
  "params_used": { "verbosity": "low", "reasoning_effort": "minimal" },
  "latency_ms": 2081
}
```

### Prompting rules (summary)

- “You are a master poet… under 3 lines… include the clock time…”  
- **No AM/PM** (we pre-strip it from `time_used` and instruct the model not to add it)
- **No timezone names**
- Style follows `tone`, with a compact “style requirements” hint
- `daypart` is provided as **metadata** to steer imagery without leaking AM/PM

### Models & Responses API parameters

- **GPT-5 only**: `model: gpt-5 | gpt-5-mini | gpt-5-nano`
- **Use** `responses.create` with:
  - `input`: prompt string
  - `max_output_tokens`: cap for generated text
  - `text`: `{ format: { type: "text" }, verbosity: "low|medium|high" }`
  - `reasoning`: `{ effort: "minimal|low|medium|high" }`
- **Do NOT** send `temperature` to GPT-5 models (not supported with Responses API).
- We default to `verbosity=low`, `reasoning_effort=minimal` for speed & succinctness (tunable via env).

### Robust text extraction (important)

GPT-5 responses sometimes return:
- a **“reasoning”** output item (with `summary`) and
- a **“message”** item (with `content[*].text`)

We:
1) Try `response.output_text` (SDK convenience).  
2) Then scan each `output` item:
   - Item-level `output_text` / `text`
   - **Item-level `summary`** (supports both dict **and list** shapes)
   - `message.content[*].text` or blocks with `text.value`
   - Fallback: scan `content[*]` for `output_text`/`text`/`value`
3) If all else fails and a `reasoning.summary` has text, we can use it as a last resort.

Enable `ADAPTER_DEBUG=1` to log a compact structural peek so you can see exactly where the text lives.

---

## Frontend Overview

- **Vite + React (TypeScript)**
- `App.tsx` renders the poem, tone selector, daypart display, and a **Fullscreen** button
- **Minute auto-refresh (default ON)**:
  - Schedules next fetch aligned to the next minute with a small jitter (to avoid thundering herd)
  - Uses Page Visibility API: pauses updates when tab is hidden; resumes when visible
- Responsive typography; layout expands to **full viewport height** (`100svh`) and supports presentation-like fullscreen

---

## Environment Setup

### Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# Swagger UI:
# http://127.0.0.1:8000/docs
```

### Node (frontend)

Use a platform-agnostic setup (avoid platform-specific devDependencies like `@rollup/rollup-darwin-arm64`).

```bash
cd web
npm install
npm run dev
# Dev server will print a local URL
```

**Tip (Apple Silicon + Linux mixed dev environments):**  
If a previous `package.json` contained platform-specific packages (e.g., `@rollup/rollup-darwin-arm64`), remove them and reinstall. Keep `devDependencies` generic (vite, @vitejs/plugin-react, typescript, etc.).

---

## .env (example)

> **Important:** For list fields, use comma-separated **or** valid JSON arrays with quoted strings.

```dotenv
# Required
OPENAI_API_KEY=sk-...

# Which model users see by default
PRIMARY_MODEL=gpt-5-nano

# Optional (A/B or shadow infra exists, but you can keep single)
SECONDARY_MODEL=gpt-5-mini
TERTIARY_MODEL=gpt-5

# Experiment mode: single | ab | shadow
EXPERIMENT_MODE=single
AB_SPLIT=20

# Shadow targets; use CSV or valid JSON with quotes
# CSV:
SHADOW_TARGETS=gpt-5-mini,gpt-5-nano
# OR JSON:
# SHADOW_TARGETS=["gpt-5-mini","gpt-5-nano"]

# Safety
DAILY_COST_LIMIT_USD=0.50
CORS_ORIGINS=*

# GPT-5 Responses API controls (strings)
VERBOSITY=low            # low | medium | high
REASONING_EFFORT=minimal # minimal | low | medium | high

# Pricing (per-1K tokens) — set to current rates from OpenAI pricing page
PRICE_PROMPT_gpt-5=1.25
PRICE_COMPLETION_gpt-5=10.00

PRICE_PROMPT_gpt-5-mini=0.25
PRICE_COMPLETION_gpt-5-mini=2.00

PRICE_PROMPT_gpt-5-nano=0.05
PRICE_COMPLETION_gpt-5-nano=0.40
```

> **Note:** Our settings loader ignores unknown keys so these `PRICE_*` entries don’t break validation.  
> For `SHADOW_TARGETS`, avoid invalid JSON like `[gpt-5-mini,gpt-5-nano]` (quotes required). CSV is easiest.

---

## Caching

- In-memory Python dict keyed by `minute + tone` (e.g., `08:18_stoic`)
- TTL ~60s; we clear each minute to ensure freshness
- `forceNew=true` bypasses cache

---

## Events Database (SQLite)

**Location:** `data/events.db`  
**Schema:**
```sql
CREATE TABLE events(
  ts_iso TEXT,
  request_id TEXT,
  status TEXT,              -- ok | fallback | shadow (if enabled)
  model TEXT,
  tone TEXT,
  timezone TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  cost_usd REAL,
  cached INT,               -- 0/1
  extra_json TEXT           -- full response snapshot (poem, response_id, latency_ms, params_used, daypart, etc.)
);
```

**Export to CSV (full):**
```bash
sqlite3 -header -csv data/events.db "
SELECT
  ts_iso,
  request_id,
  status,
  model,
  tone,
  timezone,
  cached,
  prompt_tokens,
  completion_tokens,
  cost_usd,
  json_extract(extra_json,'$.poem')        AS poem,
  json_extract(extra_json,'$.daypart')     AS daypart,
  json_extract(extra_json,'$.response_id') AS response_id,
  json_extract(extra_json,'$.latency_ms')  AS latency_ms
FROM events
ORDER BY ts_iso;
" > export/poems_full.csv
```

**Quick counts & peek:**
```bash
sqlite3 data/events.db "SELECT COUNT(*) FROM events;"
sqlite3 data/events.db "SELECT ts_iso,status,model,cached,substr(extra_json,1,160) FROM events ORDER BY rowid DESC LIMIT 5;"
```

---

## Using the API

**cURL:**
```bash
curl -s -X POST 'http://127.0.0.1:8000/api/poem' \
  -H 'Content-Type: application/json' \
  -d '{"tone":"Stoic","timezone":"America/Chicago","format":"12h","forceNew":true}' | jq .
```

**Swagger:**  
Open `http://127.0.0.1:8000/docs` and use the `POST /api/poem` operation interactively.

---

## Switching Models

Edit `.env`:
```
PRIMARY_MODEL=gpt-5-mini   # or gpt-5, gpt-5-nano
```
Then restart the server. To ensure you bypass cache, hit the API with `"forceNew": true` and check the `"model"` in the response.

---

## Fullscreen / Presentation Mode

- The UI uses `100svh` and responsive type
- A **Fullscreen** button requests the browser fullscreen API
- Escape or browser UI exits fullscreen

---

## Troubleshooting

- **500 with “Unsupported parameter: temperature”:**  
  Don’t send `temperature` to GPT-5 via Responses API. Our adapter gates it automatically.
- **Empty poem / only reasoning item in output:**  
  Increase `max_output_tokens` (e.g., 150–200), and set `REASONING_EFFORT=minimal`.  
  Enable `ADAPTER_DEBUG=1` to print a structured peek; we parse item `summary` (dict or list) and `content` blocks.
- **dotenv parse errors:**  
  Lists must be CSV (`a,b,c`) **or** valid JSON with quotes (`["a","b","c"]`).  
  Avoid `[a,b]` (invalid JSON).
- **Vite/rollup platform errors:**  
  Remove platform-specific devDependencies (e.g., `@rollup/rollup-darwin-arm64`). Reinstall with generic deps.  
  Use Node LTS (v20+). `npm cache clean --force && rm -rf node_modules package-lock.json && npm install`.
- **404 at `/`:**  
  Backend serves only API; frontend runs on Vite dev server. In prod, serve the frontend statics or proxy.

---

## Git & .gitignore

Example `.gitignore` (already included):
```
# Python
.venv/
__pycache__/
*.pyc

# Node
web/node_modules/
web/.vite/
web/dist/

# Env & data
.env
data/*.db
export/

# OS / editor
.DS_Store
.vscode/
```

**Create repo & push:**
```bash
git init
git add .
git commit -m "Initial ChronoVerse"
git branch -M main
git remote add origin git@github.com:scottlabbe/chronoverse.git
git push -u origin main
```

---

## Deployment

- **Replit / simple VM**: run FastAPI with `uvicorn`, host frontend as static build or keep Vite dev server behind a reverse proxy for local
- Ensure `OPENAI_API_KEY` & other envs are set securely
- Consider a small process manager (e.g., `pm2`, `systemd`) for `uvicorn`
