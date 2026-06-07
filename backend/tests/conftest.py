"""
Shared test fixtures for Phase 2 database/RLS/encryption tests.

Prerequisites:
  - A running PostgreSQL instance reachable via TEST_DATABASE_DSN.
    Host-side local dev uses localhost:5433; inside Docker, settings.database_dsn
    points at db:5432.
  - `alembic upgrade head` applied to the target DB before running DB-dependent tests.

All DB-dependent tests skip automatically when the database is unreachable.
Encryption tests are pure unit tests — no DB required.

Connection strategy:
  - `admin_conn` (function-scoped): fresh asyncpg connection as superuser per test.
    Superusers bypass RLS, so this connection is safe for seeding + schema inspection.
  - `tx_conn` (function-scoped): starts a transaction on admin_conn; always rolls back
    after the test to keep the DB clean.

RLS isolation tests use `SET LOCAL ROLE app_runtime` inside the tx_conn transaction to
switch to a non-superuser role, making RLS policies apply (superusers bypass RLS).
`app_runtime` is created by the P2 migration.
"""

from __future__ import annotations

import os

import asyncpg
import pytest

from app.config import settings

# Allow override via environment for CI/CD pipelines.
# Falls back to the raw asyncpg DSN from config (localhost for local dev).
TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


@pytest.fixture
async def admin_conn():
    """
    Function-scoped asyncpg connection as the superuser (dataautomated).

    Superusers bypass RLS — use this connection for DDL inspection and for
    seeding test data that RLS would otherwise block.
    Skips the test if the database is not reachable.
    """
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping DB-dependent test.")
    yield conn
    await conn.close()


@pytest.fixture
async def tx_conn(admin_conn: asyncpg.Connection):
    """
    Function-scoped connection with a transaction that ALWAYS rolls back.

    Use this for any test that writes data — rollback keeps the DB clean between
    tests without requiring explicit teardown.

    Tip: `SET LOCAL ROLE app_runtime` and `SELECT set_config(..., TRUE)` inside this
    fixture are transaction-scoped and are automatically undone on rollback.
    """
    tr = admin_conn.transaction()
    await tr.start()
    yield admin_conn
    await tr.rollback()
