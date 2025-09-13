from alembic import context
from logging.config import fileConfig
from app.db import engine, is_sqlite

# this Alembic Config object provides access to the values within the .ini file in use.
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# We're not using ORM models/metadata yet; write explicit migrations.
target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL to stdout/file, no DB connection)."""
    url = str(engine.url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=is_sqlite(),  # allows ALTER TABLE on SQLite via batch ops
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (apply to a live DB connection)."""
    with engine.connect() as connection:
        # Optional probe; uncomment if you want a fast fail when DB is unreachable
        # connection.execute(text("SELECT 1"))
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite(),
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
