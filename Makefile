.PHONY: build-frontend db-upgrade dev fmt

build-frontend:
	npm --prefix web install
	npm --prefix web run build

db-upgrade:
	PYTHONPATH=. python -m alembic upgrade head

dev:
	uvicorn app.main:app --reload

fmt:
	python -m pip install ruff black --quiet || true
	ruff check --fix .
	black .