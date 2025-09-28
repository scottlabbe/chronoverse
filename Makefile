.ONESHELL:
.PHONY: build-frontend db-upgrade dev fmt pg-up pg-down pg-logs pg-psql db-status

ENV_FILE ?= .env
DOCKER_COMPOSE ?= docker compose

build-frontend:
	rm -rf apps/web/dist apps/web/build
	$(DOCKER_COMPOSE) run --rm --no-deps web-build npm install
	$(DOCKER_COMPOSE) run --rm --no-deps web-build npm run build

db-upgrade:
	PYTHONPATH=apps/backend python -m alembic --config apps/backend/alembic.ini upgrade head

dev:
	PYTHONPATH=apps/backend uvicorn app.main:app --reload --env-file $(ENV_FILE)

fmt:
	python -m pip install ruff black --quiet || true
	ruff check --fix .
	black .

export-openapi:
	python scripts/export_openapi.py

# --- Local Postgres via Docker Compose ---
pg-up:
	docker compose up -d db

pg-down:
	docker compose down

pg-logs:
	docker compose logs -f db

pg-psql:
	docker compose exec db psql -U postgres -d postgres

db-status:
	PYTHONPATH=. python scripts/db_status.py
