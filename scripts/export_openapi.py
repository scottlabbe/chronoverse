"""Export the FastAPI OpenAPI schema to packages/shared-schemas/openapi.json."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_PATH = ROOT / "apps" / "backend"
SCHEMA_PATH = ROOT / "packages" / "shared-schemas" / "openapi.json"
TMP_DB = ROOT / ".tmp" / "openapi.db"

# Ensure backend package is importable when executed from repo root
sys.path.insert(0, str(BACKEND_PATH))

# Provide safe defaults when env vars are absent (schema export does not hit prod services)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TMP_DB.as_posix()}")
os.environ.setdefault("OPENAI_API_KEY", "sk-present-verse-placeholder")
TMP_DB.parent.mkdir(parents=True, exist_ok=True)


def export_schema(output_path: Path) -> Path:
    from app.main import app  # Imported lazily after env defaults are in place

    schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return output_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export OpenAPI schema for The Present Verse backend")
    parser.add_argument(
        "--output",
        type=Path,
        default=SCHEMA_PATH,
        help="Destination file for the OpenAPI document (default: packages/shared-schemas/openapi.json)",
    )
    args = parser.parse_args(argv)

    output_path = export_schema(args.output.resolve())
    rel = output_path.relative_to(ROOT)
    print(f"Wrote OpenAPI schema to {rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
