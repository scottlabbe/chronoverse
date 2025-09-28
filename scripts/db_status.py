import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "backend"))

from sqlalchemy import text
from app.db import engine, dialect

def main() -> int:
    print('dialect:', dialect())
    try:
        print('url:', str(engine.url))
    except Exception:
        pass
    ok = True
    with engine.begin() as conn:
        try:
            conn.execute(text('SELECT 1'))
            print('db: ok')
        except Exception as e:
            print('db error:', e)
            ok = False
        try:
            if dialect() == 'postgresql':
                users = conn.execute(text("SELECT to_regclass('public.users')")).scalar()
                subs  = conn.execute(text("SELECT to_regclass('public.subscriptions')")).scalar()
                print('users table:', bool(users))
                print('subscriptions table:', bool(subs))
            else:
                users = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"))\
                            .scalar()
                subs  = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'"))\
                            .scalar()
                print('users table:', bool(users))
                print('subscriptions table:', bool(subs))
        except Exception as e:
            print('introspection error:', e)
            ok = False
    return 0 if ok else 1

if __name__ == '__main__':
    raise SystemExit(main())
