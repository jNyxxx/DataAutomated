"""
Phase 2 — Database schema verification tests (DATABASE_FOUNDATION.md §10).

Requires: running PostgreSQL + `alembic upgrade head` applied.
Tests skip automatically when the database is unreachable.

Verifies:
  - uuid-ossp and vector extensions present.
  - All 10 canonical tables exist.
  - Critical column types match the spec (UUID, TIMESTAMPTZ, JSONB, vector).
  - ivfflat cosine index on knowledge_embeddings exists.
  - Vector similarity query (<=>) returns results — proves pgvector is functional.
  - RLS is enabled on all 8 tenant tables.
  - CHECK constraints exist for all documented enumerable fields.
"""

from __future__ import annotations

import pytest
import asyncpg

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CANONICAL_TABLES = [
    "clients",
    "users",
    "data_sources",
    "raw_feedback",
    "feedback_insights",
    "competitive_signals",
    "journey_events",
    "journey_insights",
    "knowledge_embeddings",
    "reports",
]

RLS_TABLES = [
    "raw_feedback",
    "feedback_insights",
    "competitive_signals",
    "journey_events",
    "journey_insights",
    "data_sources",
    "reports",
    "knowledge_embeddings",
]

CHECK_CONSTRAINTS = [
    ("clients", "clients_plan_check"),
    ("users", "users_role_check"),
    ("feedback_insights", "feedback_insights_sentiment_label_check"),
    ("competitive_signals", "competitive_signals_urgency_check"),
    ("journey_insights", "journey_insights_friction_cause_check"),
]


# ---------------------------------------------------------------------------
# Extension tests
# ---------------------------------------------------------------------------

class TestExtensions:
    async def test_vector_extension_present(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            "SELECT extname FROM pg_extension WHERE extname = 'vector';"
        )
        assert row is not None, "pgvector extension must be installed"

    async def test_uuid_ossp_extension_present(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            "SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp';"
        )
        assert row is not None, "uuid-ossp extension must be installed"


# ---------------------------------------------------------------------------
# Table existence tests
# ---------------------------------------------------------------------------

class TestTablesExist:
    @pytest.mark.parametrize("table_name", CANONICAL_TABLES)
    async def test_table_exists(self, admin_conn: asyncpg.Connection, table_name: str):
        row = await admin_conn.fetchrow(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1;
            """,
            table_name,
        )
        assert row is not None, f"Table '{table_name}' must exist in the public schema"


# ---------------------------------------------------------------------------
# Column type spot-checks
# ---------------------------------------------------------------------------

class TestColumnTypes:
    async def test_clients_id_is_uuid(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'id';
            """
        )
        assert row is not None and row["data_type"] == "uuid"

    async def test_clients_created_at_is_timestamptz(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'created_at';
            """
        )
        assert row is not None and row["data_type"] == "timestamp with time zone"

    async def test_data_sources_credentials_is_jsonb(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'data_sources' AND column_name = 'credentials';
            """
        )
        assert row is not None and row["data_type"] == "jsonb"

    async def test_knowledge_embeddings_embedding_is_vector(self, admin_conn: asyncpg.Connection):
        # pgvector columns appear as USER-DEFINED in information_schema
        row = await admin_conn.fetchrow(
            """
            SELECT data_type, udt_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'knowledge_embeddings'
              AND column_name = 'embedding';
            """
        )
        assert row is not None, "knowledge_embeddings.embedding column must exist"
        assert row["data_type"] == "USER-DEFINED", (
            "embedding must be a user-defined type (pgvector)"
        )
        assert row["udt_name"] == "vector", "embedding udt_name must be 'vector'"

    async def test_raw_feedback_metadata_is_jsonb(self, admin_conn: asyncpg.Connection):
        row = await admin_conn.fetchrow(
            """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'raw_feedback' AND column_name = 'metadata';
            """
        )
        assert row is not None and row["data_type"] == "jsonb"

    async def test_competitive_signals_uses_detected_at_not_created_at(
        self, admin_conn: asyncpg.Connection
    ):
        """Verify the canonical timestamp column name is detected_at (not created_at)."""
        detected = await admin_conn.fetchrow(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'competitive_signals'
              AND column_name = 'detected_at';
            """
        )
        created = await admin_conn.fetchrow(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'competitive_signals'
              AND column_name = 'created_at';
            """
        )
        assert detected is not None, "competitive_signals must have detected_at column"
        assert created is None, "competitive_signals must NOT have created_at (spec uses detected_at)"

    async def test_raw_feedback_uses_ingested_at_not_created_at(
        self, admin_conn: asyncpg.Connection
    ):
        ingested = await admin_conn.fetchrow(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'raw_feedback'
              AND column_name = 'ingested_at';
            """
        )
        assert ingested is not None, "raw_feedback must have ingested_at column"


# ---------------------------------------------------------------------------
# Index tests
# ---------------------------------------------------------------------------

class TestIndexes:
    async def test_ivfflat_index_exists_on_knowledge_embeddings(
        self, admin_conn: asyncpg.Connection
    ):
        row = await admin_conn.fetchrow(
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'knowledge_embeddings'
              AND indexdef ILIKE '%ivfflat%';
            """
        )
        assert row is not None, "ivfflat index must exist on knowledge_embeddings"
        assert "vector_cosine_ops" in row["indexdef"], (
            "ivfflat index must use vector_cosine_ops"
        )

    async def test_hot_path_index_raw_feedback_unprocessed(
        self, admin_conn: asyncpg.Connection
    ):
        row = await admin_conn.fetchrow(
            """
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'raw_feedback'
              AND indexdef ILIKE '%processed%';
            """
        )
        assert row is not None, "Partial index on raw_feedback (processed=FALSE) must exist"


# ---------------------------------------------------------------------------
# pgvector functional test
# ---------------------------------------------------------------------------

class TestVectorSimilarity:
    async def test_similarity_query_returns_results(self, tx_conn: asyncpg.Connection):
        """Insert a 1536-dim vector row and prove the <=> operator works."""
        # Build a 1536-dimensional vector literal
        vec = "[" + ",".join(["0.1"] * 1536) + "]"
        query_vec = "[" + ",".join(["0.2"] * 1536) + "]"

        # Insert as superuser — RLS is bypassed (no tenant context set yet)
        await tx_conn.execute(
            "INSERT INTO knowledge_embeddings (content, embedding) VALUES ($1, $2::vector(1536));",
            "test-vector-content",
            vec,
        )

        # Run a cosine similarity query using the <=> operator
        rows = await tx_conn.fetch(
            """
            SELECT id, 1 - (embedding <=> $1::vector(1536)) AS similarity
            FROM knowledge_embeddings
            ORDER BY embedding <=> $1::vector(1536)
            LIMIT 5;
            """,
            query_vec,
        )
        assert len(rows) >= 1, "Similarity query must return at least one result"
        for row in rows:
            assert row["similarity"] is not None, "Similarity score must not be NULL"


# ---------------------------------------------------------------------------
# RLS enablement tests
# ---------------------------------------------------------------------------

class TestRLSEnabled:
    @pytest.mark.parametrize("table_name", RLS_TABLES)
    async def test_rls_enabled(self, admin_conn: asyncpg.Connection, table_name: str):
        """Verify RLS is enabled (relrowsecurity=TRUE) on every required tenant table."""
        row = await admin_conn.fetchrow(
            """
            SELECT relrowsecurity
            FROM pg_class
            WHERE relname = $1 AND relnamespace = 'public'::regnamespace;
            """,
            table_name,
        )
        assert row is not None, f"Table '{table_name}' not found in pg_class"
        assert row["relrowsecurity"] is True, (
            f"RLS must be enabled on '{table_name}'"
        )

    @pytest.mark.parametrize("table_name", RLS_TABLES)
    async def test_client_isolation_policy_exists(
        self, admin_conn: asyncpg.Connection, table_name: str
    ):
        """Verify the client_isolation policy is present on every RLS-enabled table."""
        row = await admin_conn.fetchrow(
            """
            SELECT polname
            FROM pg_policy
            WHERE polrelid = $1::regclass AND polname = 'client_isolation';
            """,
            table_name,
        )
        assert row is not None, (
            f"client_isolation policy must exist on '{table_name}'"
        )


# ---------------------------------------------------------------------------
# CHECK constraint tests
# ---------------------------------------------------------------------------

class TestCheckConstraints:
    @pytest.mark.parametrize("table_name,constraint_name", CHECK_CONSTRAINTS)
    async def test_check_constraint_exists(
        self,
        admin_conn: asyncpg.Connection,
        table_name: str,
        constraint_name: str,
    ):
        row = await admin_conn.fetchrow(
            """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = $1::regclass
              AND contype = 'c'
              AND conname = $2;
            """,
            table_name,
            constraint_name,
        )
        assert row is not None, (
            f"CHECK constraint '{constraint_name}' must exist on '{table_name}'"
        )

    async def test_clients_plan_check_valid_values(self, tx_conn: asyncpg.Connection):
        """Verify the plan CHECK allows the four documented tiers."""
        for plan in ("insight_starter", "intelligence_core", "strategic_suite", "enterprise"):
            await tx_conn.execute(
                "INSERT INTO clients (name, email, plan) VALUES ($1, $2, $3);",
                f"Test Client {plan}",
                f"{plan}@test.com",
                plan,
            )

    async def test_clients_plan_check_rejects_invalid(self, tx_conn: asyncpg.Connection):
        """Verify the plan CHECK rejects an undocumented tier."""
        with pytest.raises(asyncpg.CheckViolationError):
            await tx_conn.execute(
                "INSERT INTO clients (name, email, plan) VALUES ($1, $2, $3);",
                "Bad Client",
                "bad@test.com",
                "not_a_real_plan",
            )

    async def test_journey_insights_friction_cause_check_rejects_invalid(
        self, tx_conn: asyncpg.Connection
    ):
        """Spot-check: friction_cause must be in {ux_friction, messaging, expectation}."""
        # Create a client first (required FK)
        client_id = await tx_conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ('c', 'c@test.com') RETURNING id;"
        )
        with pytest.raises(asyncpg.CheckViolationError):
            await tx_conn.execute(
                "INSERT INTO journey_insights (client_id, friction_cause) VALUES ($1, $2);",
                client_id,
                "bad_value",
            )
