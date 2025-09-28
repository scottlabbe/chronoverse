# ChronoVerse

Minimalist, living “time poems.” Each visit (or minute) generates a short poem that *includes the current time*, in a chosen tone, without AM/PM or timezone names. Built with FastAPI + Vite/React, powered by OpenAI GPT-5 models via the **Responses API**.

## ✨ Highlights

- **Clean UI** with big type and optional fullscreen “presentation mode”
- **Tones**: Whimsical, Wistful, Funny, Noir, Minimal, Cosmic, Nature, Romantic, Spooky
- **Prompt rules**: must include clock time, under 3 lines, no AM/PM, no timezone, style follows chosen tone
- **Daypart awareness**: early morning / morning / afternoon / evening / night / late night, injected as metadata (not literal AM/PM) to guide imagery
- **Minute auto-refresh** (default **ON**): new poem each minute, with jitter, pauses when tab hidden
- **Model switching**: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- **GPT-5 controls**: `text.verbosity`, `reasoning.effort` (Responses API)
- **Caching**: in-memory, per minute+tone
- **Logging**: SQL-backed events table with full response snapshot in JSON for later analysis
- **Swagger UI**: interactive testing at `/docs` (when enabled via `ENABLE_SWAGGER=1`)

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
│  │  ├─ events.py             # Events/usage logging helpers (SQLAlchemy)
│  │  └─ subscriptions.py      # Subscription persistence helpers
│  └─ core/
│     └─ types.py              # Pydantic request/response types (PoemRequest/PoemResponse)
├─ web/
│  ├─ index.html
│  ├─ vite.config.ts
│  ├─ package.json
│  └─ src/
│     ├─ main.tsx              # routes: "/" (Home) and "/app" (poem app)
│     ├─ pages/
│     │  └─ Home.tsx           # landing page with corner micro‑nav (version/theme)
│     ├─ App.tsx               # main poem app (timer, tone selector, presentation)
│     ├─ components/
│     │  └─ ControlsRail.tsx   # minimal corner menu (present, billing, sign out)
│     ├─ lib/
│     │  ├─ api.ts             # client for /api endpoints
│     │  └─ supabase.ts        # Supabase client (auth)
│     └─ styles/
│        └─ globals.css        # responsive typography, presentation sizing
├─ .env                        # environment variables (see below)
├─ requirements.txt
├─ .gitignore
└─ README.md
```

### Frontend build environment

`make build-frontend` runs inside the Docker Compose service `web-build`, which uses Node 20 on Debian so local builds match Railway. Ensure Docker Desktop is running before invoking it.

Need an ad-hoc command? Run it through the same containerized environment:

```
docker compose run --rm --no-deps web-build npm install
docker compose run --rm --no-deps web-build npm run build
```

Dependencies installed in the container stay in the named Docker volume (`web-build-node_modules`), so your host setup remains untouched. If you prefer to run the Vite dev server on macOS directly, run `npm --prefix web install` after the container install finishes.

---

## Backend Overview

### Endpoint

```
POST /api/poem
```

**Request body** (JSON):
```json
{
  "tone": "Wistful",
  "timezone": "America/Chicago",
  "format": "12h",
  "forceNew": true
}
```

- `tone`: one of: Whimsical | Wistful | Funny | Noir | Minimal | Cosmic | Nature | Romantic | Spooky
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
  "tone": "Wistful",
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
- Routes (`react-router-dom`): `"/"` → Home, `"/app"` → Poem App
- `App.tsx` renders the poem, tone selector, version/theme, and a **Presentation** toggle
- A subtle **Feedback** dialog is available in the bottom-left menu (App). It emails feedback and logs it durably.
- `Home.tsx` mirrors the app’s minimalist aesthetics with corner micro‑navigation
- **Minute auto-refresh (default ON)** in the Poem App:
  - Schedules next fetch aligned to the next minute with a small jitter (to avoid thundering herd)
  - Uses Page Visibility API: pauses updates when tab is hidden; resumes when visible
- Responsive typography; layout expands to **full viewport height** (`100svh`) and supports presentation-like fullscreen

### Home Page (design‑consistent)
- Corner micro‑nav:
  - Top‑left: version (Gallery / Manuscript / Zen)
  - Top‑right: theme (Paper / Stone / Ink / Slate / Mist)
- Minimal hero: typography adopts the selected version (serif vs sans, spacing, alignment)
- CTAs: primary “Start free/Continue” and secondary “Subscribe” using shared Button styles
- Auth: lightweight magic‑link form (no heavy chrome), status + error messages
- Bottom‑right: low‑key legal links (terms, privacy); bottom‑left: sign out label when authed

### Fonts
- No bundled webfonts; uses system stacks:
  - Serif: `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
  - Sans: `ui-sans-serif, system-ui, sans-serif`

### Client preferences (localStorage)
- `cv:tone` → current poem tone (App)
- `cv:auto` → auto-refresh enabled flag (App; default ON)
- `cv:version` → version: Gallery | Manuscript | Zen (Home + App)
- `cv:theme` → theme: Paper | Stone | Ink | Slate | Mist (Home + App)

---

## Environment Setup

### Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/postgres
uvicorn app.main:app --reload
# Swagger UI:
# http://127.0.0.1:8000/docs
```

`make pg-up` launches a local Postgres instance via Docker Compose listening on
`localhost:5433` (matching the URL above). Update the connection string if you use
another database or credentials.

### Node (frontend)

Use a platform-agnostic setup (avoid platform-specific devDependencies like `@rollup/rollup-darwin-arm64`).

```bash
cd web
npm install
npm run dev
# Dev server will print a local URL
```

Frontend env (Vite) is read from `web/.env*` files. For Supabase auth locally, set:

```bash
# web/.env.local
VITE_SUPABASE_URL=...      # from your Supabase project settings
VITE_SUPABASE_ANON_KEY=... # public anon key
VITE_API_BASE=/api         # default; dev proxy maps /api → http://127.0.0.1:8000
```

**Tip (Apple Silicon + Linux mixed dev environments):**  
If a previous `package.json` contained platform-specific packages (e.g., `@rollup/rollup-darwin-arm64`), remove them and reinstall. Keep `devDependencies` generic (vite, @vitejs/plugin-react, typescript, etc.).

---

## .env (example)

> **Important:** For list fields, use comma-separated **or** valid JSON arrays with quoted strings.

```dotenv
# Required (Backend)
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5432/chronoverse
# For quick local testing you can point to sqlite:///path/to.db, but production uses Postgres.
OPENAI_API_KEY=sk-...
SUPABASE_JWT_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/jwks
# If your project still issues HS256 tokens, also set:
SUPABASE_JWT_SECRET=...
# Pin issuer for JWT hardening (from your Supabase project)
SUPABASE_ISS=https://<project-ref>.supabase.co/auth/v1

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

# Safety / CORS / Docs
DAILY_COST_LIMIT_USD=0.50
# Dev:
CORS_ORIGINS=http://localhost:5173
# Prod example:
# CORS_ORIGINS=["https://chronoverse.app","https://www.chronoverse.app"]
ENABLE_SWAGGER=0

# GPT-5 Responses API controls (strings)
VERBOSITY=low            # low | medium | high
REASONING_EFFORT=minimal # minimal | low | medium | high

# Pricing (per-1K tokens) — set to current rates from OpenAI pricing page
PRICE_PROMPT_gpt-5=1.25
PRICE_COMPLETION_gpt-5=10.00

PRICE_PROMPT_gpt-5-mini=0.25
PRICE_COMPLETION_gpt-5-mini=2.00

# Rate limiting (optional; sensible defaults are built-in)
USER_RL_PER_MIN=6
IP_RL_PER_MIN=60
# Shared cache/limiter (optional): if not set, falls back to in-memory
# REDIS_URL=redis://localhost:6379/0

# Security headers (enable in prod over HTTPS)
ENABLE_HSTS=1
ENABLE_CSP=1
# Optional override, include Supabase in connect-src if needed
# CSP_POLICY="default-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'"

# Health probe protection (optional)
# HEALTH_TOKEN=<random-long-secret>

PRICE_PROMPT_gpt-5-nano=0.05
PRICE_COMPLETION_gpt-5-nano=0.40

# Optional shared cache (recommended for multiple workers/instances)
# Example: redis://localhost:6379/0
REDIS_URL=

# SMTP (Feedback email; optional but recommended)
# For Gmail, use an App Password and SMTP_HOST=smtp.gmail.com, SMTP_PORT=587
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
# From address; defaults to SMTP_USER if omitted
SMTP_FROM=
# Destination for feedback emails; defaults to scottlabbe123@gmail.com
FEEDBACK_TO=

If SMTP is not configured or sending fails, feedback is still saved to the DB and a copy is written to `data/feedback_outbox/*.eml` for inspection during development.
```

> **Note:** Our settings loader ignores unknown keys so these `PRICE_*` entries don’t break validation.  
> For `SHADOW_TARGETS`, avoid invalid JSON like `[gpt-5-mini,gpt-5-nano]` (quotes required). CSV is easiest.

---

## Caching

- Cache key: `YYYY-MM-DDTHH:MM|<timezone>|<tone>|<model>` (minute granularity)
- Default in-memory cache per process (TTL ~60s)
- Optional shared cache via Redis when `REDIS_URL` is set (recommended for multi-worker/instance deploys)
- Concurrency coalescing per key to prevent thundering herd; uses Redis lock when available, otherwise local lock
- UI uses the cache for minute ticks and tone changes; tab-hidden pauses updates. `forceNew=true` is available for explicit bypass/testing.

---

## Events & Usage Tables

The `events`, `usage_events`, and `feedback` tables live in the database referenced by
`DATABASE_URL` (Postgres in production). The schema is created automatically during
startup (and mirrored in Alembic migrations) so no extra manual step is required.

Need a quick peek? On Postgres you can run:

```bash
psql "$DATABASE_URL" -c "SELECT ts_iso, status, model, tone, cached FROM events ORDER BY ts_iso DESC LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM usage_events;"
```

During development, `scripts/db_status.py` prints the active dialect plus table-presence checks:

```bash
make db-status
```

If you intentionally point `DATABASE_URL` at a SQLite file (local testing), the helper will
create it on startup and all of the same tables and queries apply.

---

## Using the API

**cURL (with Supabase auth):**
```bash
ACCESS_TOKEN="<supabase-access-token>"
curl -s -X POST 'http://127.0.0.1:8000/api/poem' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tone":"Wistful","timezone":"America/Chicago","format":"12h"}' | jq .
```

**Swagger:**  
If `ENABLE_SWAGGER=1`, open `http://127.0.0.1:8000/docs` and use the `POST /api/poem` operation interactively.

---

## Feedback API

```
POST /api/feedback  (auth required)
```

Request body:
```
{
  "message": "I love the Zen version!",
  "includeContext": true,
  "context": {
    "tone": "Wistful",
    "version": "Gallery",
    "theme": "Paper",
    "poem": "…",
    "timezone": "America/Chicago",
    "format": "12h",
    "path": "/app"
  }
}
```

Response:
```
{ "ok": true, "emailed": true, "logged": true }
```

Behavior:
- Requires Supabase JWT (same as other API routes).
- Rate limited (per-IP and per-user, shared with app limits).
- Always logs to the `feedback` table in your configured database; attempts to email to `FEEDBACK_TO`.

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
- **Presentation** toggle (in the Poem App) enters fullscreen and applies presentation sizing
- Keyboard: `F` toggles presentation; `Esc` exits; `N` forces a new poem (cache-bypass)

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


### Security & Runtime Notes
- Authentication: All API routes use Supabase JWT (RS256 via JWKS or HS256 via secret). Set `SUPABASE_ISS` to pin issuer.
- CORS: Lock `CORS_ORIGINS` to your app’s domain(s) in production; keep `http://localhost:5173` in dev.
- Cost controls: Singleflight + minute gating ensure at most one LLM call per minute per tone/timezone. `forceNew` is ignored after first-minute debit.
- Rate limits: Per-user and per-IP (env-tunable); use `REDIS_URL` for multi-instance consistency.
- Docs/health: `/docs` enabled only if `ENABLE_SWAGGER=1`. `/api/_db/health` returns `{ ok }` and can require `X-Health-Token` when `HEALTH_TOKEN` is set.
- Security headers: Enable HSTS/CSP in prod (`ENABLE_HSTS=1`, `ENABLE_CSP=1`).
