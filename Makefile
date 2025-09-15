.ONESHELL:
.PHONY: build-frontend db-upgrade dev fmt pg-up pg-down pg-logs pg-psql db-status

ENV_FILE ?= .env

build-frontend:
	rm -rf web/build
	npm --prefix web install
	npm --prefix web run build

db-upgrade:
	PYTHONPATH=. python -m alembic upgrade head

dev:
	uvicorn app.main:app --reload --env-file $(ENV_FILE)

fmt:
	python -m pip install ruff black --quiet || true
	ruff check --fix .
	black .

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
