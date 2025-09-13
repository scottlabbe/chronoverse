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
- Backend auth uses Supabase JWT. Set `SUPABASE_JWT_JWKS_URL` or `SUPABASE_JWT_SECRET` in `.env`.
- Configure DB via `DATABASE_URL`. Run `make db-upgrade` after changing models.
- The API serves built frontend from `web/dist`; in dev, run frontend separately.
