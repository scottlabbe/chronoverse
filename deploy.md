# You are here (green)
- Auth + SPA flow works; `/api/me` returns `{ userId, email, subscribed }`.
- Metering w/ minute buckets + 402 gate.
- Events module hardened; SQLAlchemy Core; Postgres path verified.
- Alembic wired; **baseline + users/subscriptions** migration applied.
- Real `is_subscribed()` hooked up; `ensure_user_row()` on `/api/me`.

---

# Recommended sequence (with deployment decision points)

## Phase 1 — Pre-deploy polish (30–45 min, local)
**Goal:** make deploy boring.

**Tasks**
1) **Requirements lock**
   - Ensure `requirements.txt` includes:
     - `fastapi`, `uvicorn[standard]`, `python-dotenv` (if used)
     - `SQLAlchemy>=2`, `alembic`
     - **Choose one**: `psycopg[binary]>=3.1,<3.3` **or** `psycopg2-binary`
   - Confirm the `DATABASE_URL` matches your choice (`+psycopg` or `+psycopg2`) consistently.

2) **Repo scripts**
   - Add a simple Makefile (optional but helpful):
     ```
     build-frontend: ; npm --prefix web ci && npm --prefix web run build
     db-upgrade: ; PYTHONPATH=. python -m alembic upgrade head
     dev: ; uvicorn app.main:app --reload
     ```
3) **CORS / Allowed origins**
   - In backend config, add your future Railway domain to allowed origins (we’ll plug the exact URL later).
4) **PWA shell assets**
   - Keep `web/public/manifest.webmanifest` + icons in sync with brand colors.
   - After `npm --prefix web run build`, verify `sw.js` and `manifest.webmanifest` exist in `web/build/` and load over HTTPS.
   - `make build-frontend` runs inside the `web-build` Docker Compose service (Node 20/Linux) so local builds match Railway.

**Acceptance**
- `make build-frontend && make db-upgrade && make dev` works locally.

> ✅ **Decision:** You’re ready to deploy to Railway **now** (before Stripe). Do this next to validate infra/auth in prod while we wire billing.

---

## Phase 2 — Deploy to Railway (prod plumbing) — **Do this next**
**Goal:** app runs on managed Postgres, auth works, metering works.

**Railway setup**
1) Create a service from your repo + add **Postgres** plugin.
2) **Env vars**
   - `DATABASE_URL` (from Railway Postgres)
   - `OPENAI_API_KEY`
   - Supabase auth (pick one):
     - RS256: `SUPABASE_JWT_JWKS_URL=<your supabase project jwks url>`
     - HS256: `SUPABASE_JWT_SECRET=<your supabase jwt secret>`
   - `FREE_MINUTES=180`
   - Frontend (build-time): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3) **Build command**
   ```
   pip install -r requirements.txt && npm --prefix web ci
   npm --prefix web run build && PYTHONPATH=. python -m alembic upgrade head
   ```
4) **Start command**
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5) **Supabase redirect URLs**
   - Add your Railway domain to Supabase Auth redirect URLs and allowed origins.

**Acceptance**
- `GET /api/_db/health` → `{"dialect":"postgresql","ok":true}`.
- Sign in → `/api/me` returns expected user.
- `/api/poem` works and meters (lower `FREE_MINUTES=2` temporarily to confirm 402).

**Pitfalls**
- Forgetting to add the Railway domain to Supabase → magic link loops.
- Not running `alembic upgrade head` in build → missing tables in prod.

---

## Phase 3 — Billing (Stripe, test mode)
**Goal:** users can subscribe; paying users bypass the gate.

**Server**
1) **Env vars (on Railway & local)**  
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `PRICE_ID`, `PUBLIC_BASE_URL`, `STRIPE_WEBHOOK_SECRET`
2) **Endpoints**
   - `POST /api/billing/checkout`  
     Creates Checkout Session (`mode=subscription`, `line_items=[{price: PRICE_ID}]`, `client_reference_id=user_id`, `success_url=${PUBLIC_BASE_URL}/app?session_id={CHECKOUT_SESSION_ID}`, `cancel_url=${PUBLIC_BASE_URL}/app`).
   - `GET /api/billing/portal`  
     Creates Billing Portal session for `stripe_customer_id`.
   - `POST /api/billing/webhook` (verify signature)  
     - `checkout.session.completed` → upsert `users.stripe_customer_id`, insert `subscriptions` row with `status`, `price_id`, `plan`, `current_period_end`.
     - `customer.subscription.updated|deleted` → keep `status`/`current_period_end` in sync.
   - `GET /api/billing/verify?session_id=cs_test_...`  
     Authenticated fallback to mirror subscription on return without relying on webhooks (idempotent; validates `client_reference_id`).
3) **Bypass**
   - `is_subscribed()` already wired; paid users immediately bypass the 402.

**Client**
- On **402** with `{ reason: "free_limit_reached" }` → show **Upgrade** card → call Checkout; on return with `?session_id=...`, call `GET /api/billing/verify` → then reload `/api/me`.
- When `/api/me.subscribed` is true → show **Manage Billing** (Portal).

**Acceptance**
- Checkout completes in Stripe **test** → webhook inserts row → `/api/me.subscribed === true` → poem endpoint never 402.
- Cancel in Portal → webhook flips status → meter applies next request.

**Pitfalls**
- Webhook not reachable (use Railway public URL).
- Wrong `PUBLIC_BASE_URL` → after checkout, you don’t land back on your `/app`.
- Timezones: ensure `current_period_end` is future vs `NOW()` in Postgres.

### Stripe CLI — local testing
Use Stripe CLI to receive webhook events during local development:

```
stripe login
stripe listen --forward-to http://127.0.0.1:8000/api/billing/webhook
```

Set env locally in `.env`:
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PUBLISHABLE_KEY=pk_test_...` (frontend uses Vite env at build)
- `PRICE_ID=price_...`
- `PUBLIC_BASE_URL=http://127.0.0.1:8000`
- `STRIPE_WEBHOOK_SECRET` (from `stripe listen` output)

Use test card `4242 4242 4242 4242` with any future expiry and CVC.

---

## Phase 4 — UX polish & visibility
**Goal:** reduce frustration and support.

**Tasks**
- **Usage banner:** show minutes used / limit (call a tiny `/api/usage/me` read-only endpoint if you want; optional).
- **Empty states:** nice message on first run; explain free-tier policy.
- **Error surfacing:** if backend returns 401 or 402, show a clear call-to-action (sign in / upgrade).
- **Manage billing link** when subscribed.

**Acceptance**
- A first-time visitor understands the plan and can subscribe if they value it.

---

## Phase 5 — Data & ops hardening (post-launch)
**Goal:** keep it healthy and cheap.

**Tasks**
- Move `events/usage_events` creation into Alembic (optional; you can keep code-managed).
- Add a nightly Railway cron to run `purge_old_events(older_than_days=90)`.
- Consider JSONB for `extra_json` + indices **only if** you start querying it.
- Observability: add structured logs for webhook events; add `/api/_db/health` to Railway health checks.

**Acceptance**
- DB size stable; no long-tail performance regressions.

---

## Phase 6 — Domain & marketing (any time)
- Add custom domain (optional now; simplest to launch with Railway default).
- Landing page copy + pricing section (explain 3 free hours/month).
- Legal basics: Privacy & Terms links (even minimal).

---

# TL;DR — What to do next
1) **Deploy to Railway now** (Phase 2). This is the ideal moment: infra is ready; we’ll validate prod login + metering.
2) After deploy is healthy, **wire Stripe** (Phase 3) and add the **Upgrade** UI on 402.
3) Add small UX touches and retention job (Phases 4–5).

If you want, I can give you paste-ready server code for `checkout`, `portal`, and `webhook` next, and a tiny React upgrade card that calls them.
