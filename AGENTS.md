# Repository Guidelines

## Project Structure & Module Organization
- Backend (`app/`): FastAPI service. Key modules: `routes/` (API), `services/` (domain logic), `core/` (config/logging/types), `db.py` (SQLAlchemy engine), `alembic/` (migrations). Data seeds in `app/data/`.
- Frontend (`web/`): Vite + React + TypeScript. Source in `web/src/`, entry `web/index.html`. Build output in `web/dist` (served by the API when built).
- Root helpers: `Makefile`, `requirements.txt`, `alembic.ini`, `deploy.md`. Optional assets/export in `data/` and `export/`.

## Build, Test, and Development Commands
- Backend dev server: `make dev` (runs `uvicorn app.main:app --reload`).
- Frontend dev server: `npm --prefix web run dev`.
- Frontend build: `make build-frontend` (installs and builds into `web/dist`).
- DB migrations: `make db-upgrade` (applies Alembic migrations).
- Format & lint: `make fmt` (ruff fix + black).

Suggested local setup:
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.dev .env  # edit values
make build-frontend && make dev
```

`make build-frontend` runs inside the `web-build` Docker Compose service (Node 20 on Debian) so local builds match Railway. Ensure Docker Desktop is running before invoking it.

To run ad-hoc npm commands in the same environment:

```
docker compose run --rm --no-deps web-build npm install
docker compose run --rm --no-deps web-build npm run build
```

Container installs live in the `web-build-node_modules` Docker volume, so the host `web/node_modules` isn’t touched. If you want to run the Vite dev server directly on macOS, follow up with `npm --prefix web install` in your local shell.

## Coding Style & Naming Conventions
- Python: 4-space indent, type hints encouraged. Run `make fmt` before commits (Ruff + Black).
- TS/React: follow existing patterns in `web/src`, PascalCase components in `components/`, kebab-case files for non-components.
- Environment: never commit secrets; prefer `.env` and `.env.local` (frontend).

## Testing Guidelines
- No formal test suite yet. Prefer adding `pytest` for backend and component tests for frontend. Name tests `test_*.py` (backend) and `*.test.tsx` (frontend). Run with `pytest` or Vite/Jest if added.

## Commit & Pull Request Guidelines
- Commits: concise, present tense. Conventional Commits preferred (e.g., `feat: add poem endpoint`, `fix: handle JWT errors`).
- PRs: include summary, rationale, screenshots/GIFs for UI changes, and steps to verify. Link related issues and note env or migration changes (`alembic` revision IDs).

## Security & Configuration Tips
- Auth: Supabase JWT required on API routes. Set `SUPABASE_JWT_JWKS_URL` (RS256) and/or `SUPABASE_JWT_SECRET` (HS256). Pin issuer with `SUPABASE_ISS=https://<ref>.supabase.co/auth/v1`.
- CORS: Use `CORS_ORIGINS=http://localhost:5173` in dev; set to your prod domains before deploy.
- Rate limits & cache: Per-user/IP throttles via `USER_RL_PER_MIN`/`IP_RL_PER_MIN`; optional `REDIS_URL` enables shared cache/limits across instances.
- Cost controls: Minute-level gating + singleflight ensure one model call per minute/tone/timezone; `forceNew` is ignored after first-minute debit.
- Headers: Enable `ENABLE_HSTS=1` and `ENABLE_CSP=1` in prod; override `CSP_POLICY` if needed.
- Docs/health: `/docs` only with `ENABLE_SWAGGER=1`. `/api/_db/health` returns `{ ok }`; protect with `HEALTH_TOKEN` if exposed.
- DB & migrations: Configure `DATABASE_URL`. Run `make db-upgrade` after changing schema.
- Frontend hosting: API can serve `web/dist`; in dev, run Vite separately.
