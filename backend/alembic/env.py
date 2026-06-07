"""
Alembic environment — async migration mode (DATABASE_FOUNDATION.md §5; D3; AUD-02/04).

Key design choices:
  - Uses settings.database_url (postgresql+asyncpg:// dialect URL) — the SQLAlchemy/Alembic
    URL.  NEVER uses settings.database_dsn (the raw asyncpg DSN).  AUD-02.
  - Async engine + NullPool for migrations — avoids pool-to-pool conflicts with the
    application pool (built in P3).
  - target_metadata = Base.metadata — enables schema diffing for future autogenerate runs.
  - No auto-DDL on startup — migrations are the only way schema changes ship (AUD-04).
"""

from __future__ import annotations

import asyncio
import os
import sys

# Ensure `backend/` is on sys.path so `from app.X import Y` resolves correctly
# when alembic is run from the backend/ directory (where alembic.ini lives).
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from logging.config import fileConfig  # noqa: E402

from sqlalchemy import pool  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from alembic import context  # noqa: E402

# Import settings first (needed to inject the URL before anything else runs).
from app.config import settings  # noqa: E402

# Import Base and all models so every table is registered in Base.metadata.
from app.models import Base  # noqa: F401, E402
from app.models import (  # noqa: F401, E402
    Client, User, DataSource, Report,
    RawFeedback, FeedbackInsight, KnowledgeEmbedding,
    CompetitiveSignal,
    JourneyEvent, JourneyInsight,
)

# ---------------------------------------------------------------------------
# Alembic config
# ---------------------------------------------------------------------------
config = context.config

# Inject the SQLAlchemy/Alembic dialect URL from settings (AUD-02).
# This is the postgresql+asyncpg:// URL — never the raw asyncpg DSN.
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Migration runners
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    Emits SQL to stdout/file without a live DB connection — useful for
    generating migration scripts to review before applying.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Synchronous migration runner called within an async connection context."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode against a live database.

    NullPool is used so every migration run gets a fresh connection and
    does not conflict with the application pool (P3).
    """
    connectable = create_async_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run() -> None:
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        asyncio.run(run_migrations_online())


run()
