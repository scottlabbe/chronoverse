# Tiny SQLite logger: events(ts_iso TEXT, request_id TEXT, status TEXT, model TEXT, tone TEXT,
#                           timezone TEXT, prompt_tokens INT, completion_tokens INT, cost_usd REAL, cached INT, extra_json TEXT)
import sqlite3, os, datetime as dt, json
os.makedirs("data", exist_ok=True)
_DB="data/events.db"

def _conn():
    return sqlite3.connect(_DB, check_same_thread=False)


def init_db():
    with _conn() as c:
        # Create table with the newest schema (includes extra_json)
        c.execute(
            """CREATE TABLE IF NOT EXISTS events(
                ts_iso TEXT,
                request_id TEXT,
                status TEXT,
                model TEXT,
                tone TEXT,
                timezone TEXT,
                prompt_tokens INT,
                completion_tokens INT,
                cost_usd REAL,
                cached INT,
                extra_json TEXT
            )"""
        )
        # If the table existed without extra_json, add it
        cols = [r[1] for r in c.execute("PRAGMA table_info(events)").fetchall()]
        if "extra_json" not in cols:
            c.execute("ALTER TABLE events ADD COLUMN extra_json TEXT")


def write_event(row: dict):
    """Insert a log row. Known columns go to dedicated fields; everything else is packed into extra_json."""
    base_keys = {
        "ts_iso","request_id","status","model","tone","timezone",
        "prompt_tokens","completion_tokens","cost_usd","cached"
    }
    ts_iso = row.get("ts_iso") or row.get("generated_at_iso") or dt.datetime.utcnow().isoformat()
    # Ensure tone is a plain string (handles Enum values)
    tone_val = row.get("tone")
    tone_str = f"{tone_val}" if tone_val is not None else None
    extra = {k: v for k, v in row.items() if k not in base_keys}
    extra_json = json.dumps(extra, ensure_ascii=False, separators=(",", ":")) if extra else None
    with _conn() as c:
        c.execute(
            """INSERT INTO events(
                   ts_iso, request_id, status, model, tone, timezone,
                   prompt_tokens, completion_tokens, cost_usd, cached, extra_json)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                ts_iso,
                row.get("request_id"),
                row.get("status"),
                row.get("model"),
                tone_str,
                row.get("timezone"),
                row.get("prompt_tokens"),
                row.get("completion_tokens"),
                row.get("cost_usd"),
                1 if row.get("cached") else 0,
                extra_json,
            ),
        )
        c.commit()


def today_cost_sum() -> float:
    start = dt.datetime.utcnow().date().isoformat()
    with _conn() as c:
        cur = c.execute("SELECT COALESCE(SUM(cost_usd),0) FROM events WHERE ts_iso LIKE ?", (f"{start}%",))
        return float(cur.fetchone()[0] or 0.0)