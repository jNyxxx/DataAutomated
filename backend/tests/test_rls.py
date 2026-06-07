"""
Phase 2 — Row-Level Security isolation tests (MULTI_TENANT_SECURITY §3/§4/§10; NFR-01).

Requires: running PostgreSQL + `alembic upgrade head` applied.
Tests skip automatically when the database is unreachable.

Mechanism:
  The `dataautomated` user is a PostgreSQL superuser and bypasses RLS by default.
  To obtain a meaningful RLS test, each test executes `SET LOCAL ROLE app_runtime`
  (a non-superuser, non-BYPASSRLS role created in the P2 migration) within a
  transaction (tx_conn).  After SET ROLE, queries are evaluated against the
  app_runtime role and RLS policies apply.
  The transaction always rolls back (via tx_conn fixture), cleaning up test data.

Isolation guarantees verified:
  1. Client A can only see its own rows across all 7 standard RLS tables.
  2. An omitted WHERE clause still isolates — RLS alone is the backstop.
  3. No tenant context (missing app.current_client_id) → fail closed (empty result, no error).
  4. Explicit WHERE clause for another tenant's rows is also filtered by RLS.
  5. UPDATE targeting another tenant's rows affects 0 rows.
  6. knowledge_embeddings: global rows (client_id IS NULL) visible to all tenants;
     other tenant's rows are still invisible.
"""

from __future__ import annotations

import uuid

import asyncpg
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _switch_to_app_runtime(conn: asyncpg.Connection, client_id: uuid.UUID) -> None:
    """
    Switch the current transaction role to app_runtime and set tenant context.

    SET LOCAL ROLE: valid only inside a transaction; auto-reverts on rollback.
    set_config with is_local=TRUE: transaction-scoped; auto-reverts on rollback.
    client_id is a server-derived UUID from our test fixture — not user input.
    """
    await conn.execute("SET LOCAL ROLE app_runtime;")
    await conn.fetchval(
        "SELECT set_config('app.current_client_id', $1, TRUE);",
        str(client_id),
    )


async def _seed_two_clients(conn: asyncpg.Connection) -> tuple[uuid.UUID, uuid.UUID]:
    """Insert two test clients and return (client_a_id, client_b_id)."""
    a = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ('Tenant A', 'a@rls-test.com') RETURNING id;"
    )
    b = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ('Tenant B', 'b@rls-test.com') RETURNING id;"
    )
    return a, b


# ---------------------------------------------------------------------------
# Minimal seed SQL for each standard RLS table (excluding knowledge_embeddings)
# ---------------------------------------------------------------------------

_SEED_SQL: dict[str, str] = {
    "raw_feedback": (
        "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'feedback') RETURNING id;"
    ),
    "feedback_insights": (
        "INSERT INTO feedback_insights (client_id) VALUES ($1) RETURNING id;"
    ),
    "competitive_signals": (
        "INSERT INTO competitive_signals (client_id) VALUES ($1) RETURNING id;"
    ),
    "journey_events": (
        "INSERT INTO journey_events (client_id, event_type) VALUES ($1, 'page_view') RETURNING id;"
    ),
    "journey_insights": (
        "INSERT INTO journey_insights (client_id) VALUES ($1) RETURNING id;"
    ),
    "data_sources": (
        "INSERT INTO data_sources (client_id, source_type) VALUES ($1, 'zendesk') RETURNING id;"
    ),
    "reports": (
        "INSERT INTO reports (client_id) VALUES ($1) RETURNING id;"
    ),
}


# ---------------------------------------------------------------------------
# Core RLS isolation — raw_feedback
# ---------------------------------------------------------------------------

class TestRLSCoreIsolation:
    async def test_client_a_sees_only_own_rows(self, tx_conn: asyncpg.Connection):
        """Tenant A can only see its own raw_feedback rows."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        a_row = await tx_conn.fetchval(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'feedback A') RETURNING id;",
            a_id,
        )
        await tx_conn.execute(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'feedback B');",
            b_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch("SELECT id, client_id FROM raw_feedback;")
        ids = [r["id"] for r in rows]
        client_ids = [r["client_id"] for r in rows]

        assert a_row in ids, "Client A's row must be visible"
        assert all(cid == a_id for cid in client_ids), (
            "All visible rows must belong to client A"
        )

    async def test_omitted_where_still_isolated(self, tx_conn: asyncpg.Connection):
        """No WHERE clause + RLS alone → only the active tenant's rows are returned."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        await tx_conn.execute(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'A content');",
            a_id,
        )
        await tx_conn.execute(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'B content');",
            b_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        # Deliberately no WHERE clause — RLS must do the filtering
        rows = await tx_conn.fetch("SELECT client_id FROM raw_feedback;")
        assert all(r["client_id"] == a_id for r in rows), (
            "RLS alone must isolate — no WHERE clause needed"
        )

    async def test_no_context_fails_closed(self, tx_conn: asyncpg.Connection):
        """Missing tenant context → empty result for every RLS-protected table."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        # Seed rows for both tenants
        for cid in (a_id, b_id):
            await tx_conn.execute(
                "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'content');",
                cid,
            )

        # Switch role but DO NOT set app.current_client_id
        await tx_conn.execute("SET LOCAL ROLE app_runtime;")

        rows = await tx_conn.fetch("SELECT * FROM raw_feedback;")
        assert len(rows) == 0, (
            "Missing tenant context must fail closed — no rows returned, no error"
        )

    async def test_explicit_where_for_other_tenant_is_filtered(
        self, tx_conn: asyncpg.Connection
    ):
        """Even an explicit WHERE client_id = B_id is blocked when context = A."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        b_row = await tx_conn.fetchval(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'B') RETURNING id;",
            b_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch(
            "SELECT id FROM raw_feedback WHERE client_id = $1;",
            b_id,
        )
        assert len(rows) == 0, (
            "RLS must block B's rows even when the caller explicitly filters for B"
        )
        assert b_row not in [r["id"] for r in rows]

    async def test_update_cross_tenant_affects_zero_rows(
        self, tx_conn: asyncpg.Connection
    ):
        """UPDATE targeting another tenant's rows silently affects 0 rows."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        b_signal = await tx_conn.fetchval(
            "INSERT INTO competitive_signals (client_id, urgency) VALUES ($1, 'low') RETURNING id;",
            b_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        status = await tx_conn.execute(
            "UPDATE competitive_signals SET urgency = 'critical' WHERE id = $1;",
            b_signal,
        )
        assert status == "UPDATE 0", (
            "RLS must prevent cross-tenant UPDATE — 0 rows affected"
        )


# ---------------------------------------------------------------------------
# Parametrized: all 7 standard RLS tables
# ---------------------------------------------------------------------------

class TestRLSAllTables:
    @pytest.mark.parametrize("table_name", list(_SEED_SQL.keys()))
    async def test_client_a_cannot_see_client_b_rows(
        self, tx_conn: asyncpg.Connection, table_name: str
    ):
        """For every standard RLS table: client A's context hides client B's rows."""
        a_id, b_id = await _seed_two_clients(tx_conn)

        seed_sql = _SEED_SQL[table_name]
        a_row = await tx_conn.fetchval(seed_sql, a_id)
        b_row = await tx_conn.fetchval(seed_sql, b_id)

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch(f"SELECT id FROM {table_name};")
        ids = [r["id"] for r in rows]

        assert a_row in ids, f"{table_name}: Client A's row must be visible"
        assert b_row not in ids, f"{table_name}: Client B's row must NOT be visible"

    @pytest.mark.parametrize("table_name", list(_SEED_SQL.keys()))
    async def test_no_context_returns_empty(
        self, tx_conn: asyncpg.Connection, table_name: str
    ):
        """For every standard RLS table: no tenant context → fail closed."""
        a_id, _ = await _seed_two_clients(tx_conn)
        await tx_conn.execute(_SEED_SQL[table_name], a_id)

        await tx_conn.execute("SET LOCAL ROLE app_runtime;")

        rows = await tx_conn.fetch(f"SELECT * FROM {table_name};")
        assert len(rows) == 0, (
            f"{table_name}: Missing context must fail closed (empty result)"
        )


# ---------------------------------------------------------------------------
# knowledge_embeddings — special: NULL client_id = global
# ---------------------------------------------------------------------------

class TestKnowledgeEmbeddingsRLS:
    async def test_global_rows_visible_to_all_tenants(
        self, tx_conn: asyncpg.Connection
    ):
        """
        Global rows (client_id IS NULL) must be visible to any tenant.
        Client-specific rows must only be visible to their owner.
        """
        a_id, b_id = await _seed_two_clients(tx_conn)

        # Insert a global row (NULL client_id) — superuser bypasses RLS INSERT check
        global_id = await tx_conn.fetchval(
            "INSERT INTO knowledge_embeddings (client_id, content) VALUES (NULL, 'global') "
            "RETURNING id;"
        )
        # Insert client-specific rows
        a_embed_id = await tx_conn.fetchval(
            "INSERT INTO knowledge_embeddings (client_id, content) VALUES ($1, 'A embed') "
            "RETURNING id;",
            a_id,
        )
        b_embed_id = await tx_conn.fetchval(
            "INSERT INTO knowledge_embeddings (client_id, content) VALUES ($1, 'B embed') "
            "RETURNING id;",
            b_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch("SELECT id, client_id FROM knowledge_embeddings;")
        ids = [r["id"] for r in rows]

        assert global_id in ids, "Global row (client_id IS NULL) must be visible to tenant A"
        assert a_embed_id in ids, "Client A's own embedding must be visible"
        assert b_embed_id not in ids, "Client B's embedding must NOT be visible to tenant A"

    async def test_no_context_global_rows_also_visible(
        self, tx_conn: asyncpg.Connection
    ):
        """
        With no tenant context, global rows (client_id IS NULL) are visible
        because the policy is: client_id = NULL::UUID OR client_id IS NULL.
        NULL = NULL is NULL (not TRUE), but IS NULL is TRUE for global rows.
        """
        global_id = await tx_conn.fetchval(
            "INSERT INTO knowledge_embeddings (client_id, content) VALUES (NULL, 'global') "
            "RETURNING id;"
        )

        await tx_conn.execute("SET LOCAL ROLE app_runtime;")
        # No set_config call → app.current_client_id not set

        rows = await tx_conn.fetch("SELECT id FROM knowledge_embeddings;")
        ids = [r["id"] for r in rows]

        assert global_id in ids, (
            "Global rows (client_id IS NULL) must be visible even without tenant context "
            "(IS NULL branch of the RLS policy)"
        )

    async def test_client_specific_rows_hidden_without_context(
        self, tx_conn: asyncpg.Connection
    ):
        """Client-specific embeddings must be hidden when no tenant context is set."""
        a_id, _ = await _seed_two_clients(tx_conn)

        a_embed_id = await tx_conn.fetchval(
            "INSERT INTO knowledge_embeddings (client_id, content) VALUES ($1, 'A embed') "
            "RETURNING id;",
            a_id,
        )

        await tx_conn.execute("SET LOCAL ROLE app_runtime;")

        rows = await tx_conn.fetch(
            "SELECT id FROM knowledge_embeddings WHERE client_id IS NOT NULL;"
        )
        ids = [r["id"] for r in rows]

        assert a_embed_id not in ids, (
            "Client-specific rows must not be visible without tenant context"
        )
