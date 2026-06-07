"""
Phase 3 exit gate — pooled connection tenant isolation (MULTI_TENANT_SECURITY §4.3).

P2 tests proved RLS works on raw admin connections with SET LOCAL ROLE app_runtime.
This file proves acquire_for_client() enforces the same isolation via the shared pool —
the production code path that agents, tools, and routers use.

Key difference from P2: seed INSERTs auto-commit on admin_conn (no explicit transaction),
so pool connections on separate physical DB connections can see the seeded rows.
Each test cleans up its own committed rows explicitly.

All fixtures are function-scoped — same pattern as P2 conftest.py to avoid asyncio
cross-loop errors with pytest-asyncio.

Tests skip automatically when the database is unreachable.
"""

from __future__ import annotations

import asyncio
import os
import uuid as _uuid

import asyncpg
import pytest

import app.database as _db
from app.config import settings
from app.database import acquire_for_client, close_pool, init_pool

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


# ---------------------------------------------------------------------------
# Function-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    """Initialise the shared pool against the test DB; skip if unreachable."""
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping isolation tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    """
    Direct superuser connection for seeding test data (bypasses RLS).
    Auto-commit mode (no explicit transaction started) — each INSERT commits immediately
    so pool connections on separate DB connections can read the rows.
    """
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}).")
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Seed helpers (auto-commit — no transaction started on admin_conn)
# ---------------------------------------------------------------------------

async def _seed_two_tenants(conn: asyncpg.Connection, suffix: str) -> tuple:
    """
    Insert two clients and one raw_feedback row per client.
    All inserts auto-commit so pool connections can see them immediately.
    Returns (a_id, a_row_id, b_id, b_row_id).
    """
    a_id = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
        f"Isolation A {suffix}", f"iso_a_{suffix}@p3test.com",
    )
    b_id = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
        f"Isolation B {suffix}", f"iso_b_{suffix}@p3test.com",
    )
    a_row = await conn.fetchval(
        "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'A content') RETURNING id;",
        a_id,
    )
    b_row = await conn.fetchval(
        "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'B content') RETURNING id;",
        b_id,
    )
    return a_id, a_row, b_id, b_row


async def _cleanup(conn: asyncpg.Connection, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM raw_feedback WHERE client_id = $1;", cid)
        await conn.execute("DELETE FROM users WHERE client_id = $1;", cid)
    for cid in client_ids:
        await conn.execute("DELETE FROM clients WHERE id = $1;", cid)


# ---------------------------------------------------------------------------
# P3 exit gate tests
# ---------------------------------------------------------------------------

async def test_pooled_connection_tenant_isolation(db_pool, admin_conn):
    """
    Core P3 exit gate: acquire_for_client(a_id) must hide b's rows.

    Pool connects as `dataautomated` (superuser).  acquire_for_client sets
    SET LOCAL ROLE app_runtime (non-superuser, BYPASSRLS=false) inside a
    transaction, so RLS applies even on the superuser pool.
    """
    suffix = str(_uuid.uuid4())[:8]
    a_id, a_row, b_id, b_row = await _seed_two_tenants(admin_conn, suffix)
    try:
        async with acquire_for_client(a_id) as conn:
            rows = await conn.fetch(
                "SELECT id FROM raw_feedback WHERE client_id = $1 OR client_id = $2",
                a_id, b_id,
            )
            ids = [r["id"] for r in rows]

        assert a_row in ids, "Client A's row must be visible under acquire_for_client(a_id)"
        assert b_row not in ids, "Client B's row must NOT be visible under acquire_for_client(a_id)"
    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_context_clears_after_release(db_pool, admin_conn):
    """
    After acquire_for_client exits, the pool connection must carry no residual
    tenant context.  SET LOCAL ROLE and set_config(is_local=TRUE) both revert
    when the wrapping transaction ends.
    """
    suffix = str(_uuid.uuid4())[:8]
    a_id = await admin_conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
        f"Ctx Clear {suffix}", f"ctx_clear_{suffix}@p3test.com",
    )
    try:
        async with acquire_for_client(a_id) as conn:
            role_inside = await conn.fetchval("SELECT current_user")
            setting_inside = await conn.fetchval(
                "SELECT current_setting('app.current_client_id', TRUE)"
            )

        # After context exit: acquire another pool connection and inspect residual state
        async with _db.pool.acquire() as conn2:
            role_outside = await conn2.fetchval("SELECT current_user")
            setting_outside = await conn2.fetchval(
                "SELECT current_setting('app.current_client_id', TRUE)"
            )

        assert role_inside == "app_runtime", "Inside acquire_for_client role must be app_runtime"
        assert setting_inside == str(a_id), "Inside acquire_for_client client_id must be set"
        assert role_outside != "app_runtime", "After release role must revert to pool login role"
        assert setting_outside in ("", None), "After release tenant context must be cleared"
    finally:
        await _cleanup(admin_conn, a_id)


async def test_concurrent_checkouts_no_cross_contamination(db_pool, admin_conn):
    """
    Two concurrent acquire_for_client calls with different client_ids must each
    see only their own data — pool connections do not contaminate each other.
    """
    suffix = str(_uuid.uuid4())[:8]
    a_id, a_row, b_id, b_row = await _seed_two_tenants(admin_conn, suffix)
    try:
        async def check_a():
            async with acquire_for_client(a_id) as conn:
                rows = await conn.fetch(
                    "SELECT id FROM raw_feedback WHERE client_id = $1 OR client_id = $2",
                    a_id, b_id,
                )
                return [r["id"] for r in rows]

        async def check_b():
            async with acquire_for_client(b_id) as conn:
                rows = await conn.fetch(
                    "SELECT id FROM raw_feedback WHERE client_id = $1 OR client_id = $2",
                    a_id, b_id,
                )
                return [r["id"] for r in rows]

        a_ids, b_ids = await asyncio.gather(check_a(), check_b())

        assert a_row in a_ids and b_row not in a_ids, \
            "Concurrent A checkout must see only A's rows"
        assert b_row in b_ids and a_row not in b_ids, \
            "Concurrent B checkout must see only B's rows"
    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_no_context_fails_closed_pooled(db_pool, admin_conn):
    """
    MULTI_TENANT_SECURITY §4.3 step 4: a pool checkout with no tenant context must fail
    closed — app_runtime role without app.current_client_id cannot read tenant rows.

    This proves RLS protection is in the role switch, not only in acquire_for_client.
    When current_setting('app.current_client_id', FALSE) raises (no default), the RLS
    policy expression errors out and PostgreSQL denies access.  We accept either:
    - PostgresError (current_setting raises with no fallback)
    - Empty result set (policy evaluates to false for all rows)
    """
    suffix = str(_uuid.uuid4())[:8]
    a_id, a_row, b_id, b_row = await _seed_two_tenants(admin_conn, suffix)
    try:
        import asyncpg as _asyncpg

        async with _db.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SET LOCAL ROLE app_runtime")
                # Intentionally no set_config — context not set
                try:
                    rows = await conn.fetch("SELECT id FROM raw_feedback")
                    ids = [r["id"] for r in rows]
                    assert a_row not in ids and b_row not in ids, (
                        "RLS must block all rows when app.current_client_id is not set"
                    )
                except _asyncpg.PostgresError:
                    pass  # current_setting(...) raised — also acceptable fail-closed
    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_explicit_where_for_other_tenant_blocked_by_rls(db_pool, admin_conn):
    """
    Even if application code queries with WHERE client_id = b_id inside an
    acquire_for_client(a_id) context, RLS must block it.
    (Belt-and-suspenders: RLS is the first line of defence — CLAUDE.md §2.)
    """
    suffix = str(_uuid.uuid4())[:8]
    a_id, _a_row, b_id, b_row = await _seed_two_tenants(admin_conn, suffix)
    try:
        async with acquire_for_client(a_id) as conn:
            rows = await conn.fetch(
                "SELECT id FROM raw_feedback WHERE client_id = $1",
                b_id,
            )
            ids = [r["id"] for r in rows]

        assert b_row not in ids, \
            "RLS must block explicit WHERE client_id = b_id inside an a_id context"
    finally:
        await _cleanup(admin_conn, a_id, b_id)
