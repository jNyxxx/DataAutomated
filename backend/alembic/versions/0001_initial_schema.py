"""Initial schema — full canonical schema, RLS, indexes, app_runtime role.

Revision ID: 0001
Revises: (none — initial migration)
Create Date: 2026-06-07

Implements the canonical schema from CLAUDE.md §5 / DATABASE_FOUNDATION.md §3 exactly:
  - Extensions: vector, uuid-ossp
  - 10 tables: clients, users, data_sources, raw_feedback, feedback_insights,
    competitive_signals, journey_events, journey_insights, knowledge_embeddings, reports
  - CHECK constraints for documented enumerable fields (DATABASE_FOUNDATION §4)
  - ivfflat cosine index on knowledge_embeddings (CLAUDE §5; ADR-010)
  - Hot-path indexes (DATABASE_FOUNDATION §9)
  - app_runtime role (non-owner runtime role — enables RLS tests without superuser bypass)
  - RLS + FORCE ROW LEVEL SECURITY on 8 tenant tables (CLAUDE §5; MULTI_TENANT_SECURITY §3)
    Required:   raw_feedback, feedback_insights, competitive_signals,
                journey_events, journey_insights
    Extended:   data_sources, reports, knowledge_embeddings
                (committed default per MULTI_TENANT_SECURITY §3 "adopt")
    Policy:     current_setting('app.current_client_id', TRUE)::UUID
                Fail-closed two ways (L6): unset → NULL → no rows match (no error); a
                prior session that left the GUC = '' makes ''::UUID raise
                InvalidTextRepresentationError. Either outcome denies access.

Downgrade: drops all policies, disables RLS, revokes local app_runtime privileges,
drops tables in safe FK order. Extensions and app_runtime are intentionally NOT dropped
on downgrade because they are server-level objects and may be shared across databases;
they are re-created/reused idempotently on next upgrade.
"""

from alembic import op
from sqlalchemy import text

# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# RLS-enabled tables (for policy creation/deletion loops)
# ---------------------------------------------------------------------------
_RLS_CORE = [
    "raw_feedback",
    "feedback_insights",
    "competitive_signals",
    "journey_events",
    "journey_insights",
]
_RLS_EXTENDED = [
    "data_sources",
    "reports",
]
# knowledge_embeddings is handled separately (different policy — allows NULL client_id)
_ALL_RLS = _RLS_CORE + _RLS_EXTENDED + ["knowledge_embeddings"]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Extensions
    # ------------------------------------------------------------------
    op.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    op.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'))

    # ------------------------------------------------------------------
    # 2. Canonical tables (CLAUDE.md §5 — reproduced exactly)
    # ------------------------------------------------------------------

    op.execute(text("""
        CREATE TABLE clients (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name        VARCHAR(255) NOT NULL,
            email       VARCHAR(255) UNIQUE NOT NULL,
            plan        VARCHAR(50) DEFAULT 'insight_starter',
            api_key     VARCHAR(255) UNIQUE,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            is_active   BOOLEAN DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE users (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
            email           VARCHAR(255) UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role            VARCHAR(50) DEFAULT 'viewer',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE data_sources (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
            source_type     VARCHAR(100) NOT NULL,
            credentials     JSONB,
            config          JSONB,
            last_synced_at  TIMESTAMPTZ,
            is_active       BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE raw_feedback (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
            source_id    UUID REFERENCES data_sources(id),
            source_type  VARCHAR(100),
            external_id  VARCHAR(255),
            content      TEXT NOT NULL,
            metadata     JSONB,
            ingested_at  TIMESTAMPTZ DEFAULT NOW(),
            processed    BOOLEAN DEFAULT FALSE
        );
    """))

    op.execute(text("""
        CREATE TABLE feedback_insights (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
            feedback_ids    UUID[],
            sentiment_score FLOAT,
            sentiment_label VARCHAR(50),
            urgency_score   FLOAT,
            themes          JSONB,
            narrative       TEXT,
            churn_risk      FLOAT,
            period_start    TIMESTAMPTZ,
            period_end      TIMESTAMPTZ,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE competitive_signals (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
            competitor_name   VARCHAR(255),
            signal_type       VARCHAR(100),
            signal_source     VARCHAR(255),
            raw_content       TEXT,
            strategic_context TEXT,
            urgency           VARCHAR(50),
            detected_at       TIMESTAMPTZ DEFAULT NOW(),
            is_read           BOOLEAN DEFAULT FALSE
        );
    """))

    op.execute(text("""
        CREATE TABLE journey_events (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
            session_id   VARCHAR(255),
            user_id      VARCHAR(255),
            event_type   VARCHAR(255),
            properties   JSONB,
            occurred_at  TIMESTAMPTZ,
            ingested_at  TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE journey_insights (
            id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
            funnel_step    VARCHAR(255),
            drop_off_rate  FLOAT,
            friction_score FLOAT,
            friction_cause VARCHAR(100),
            recommendation TEXT,
            projected_lift FLOAT,
            created_at     TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE knowledge_embeddings (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id  UUID REFERENCES clients(id),
            content    TEXT NOT NULL,
            embedding  vector(1536),
            metadata   JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    op.execute(text("""
        CREATE TABLE reports (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
            report_type  VARCHAR(100),
            s3_key       VARCHAR(500),
            period_start TIMESTAMPTZ,
            period_end   TIMESTAMPTZ,
            created_at   TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    # ------------------------------------------------------------------
    # 3. CHECK constraints for documented enumerable fields
    #    (additive; DATABASE_FOUNDATION.md §4 documents allowed-value sets)
    # ------------------------------------------------------------------

    op.execute(text("""
        ALTER TABLE clients ADD CONSTRAINT clients_plan_check
            CHECK (plan IN ('insight_starter','intelligence_core','strategic_suite','enterprise'));
    """))

    op.execute(text("""
        ALTER TABLE users ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin','analyst','viewer'));
    """))

    op.execute(text("""
        ALTER TABLE feedback_insights ADD CONSTRAINT feedback_insights_sentiment_label_check
            CHECK (sentiment_label IN ('positive','negative','neutral','mixed'));
    """))

    op.execute(text("""
        ALTER TABLE competitive_signals ADD CONSTRAINT competitive_signals_urgency_check
            CHECK (urgency IN ('critical','high','medium','low'));
    """))

    op.execute(text("""
        ALTER TABLE journey_insights ADD CONSTRAINT journey_insights_friction_cause_check
            CHECK (friction_cause IN ('ux_friction','messaging','expectation'));
    """))

    # ------------------------------------------------------------------
    # 4. ivfflat cosine index on knowledge_embeddings (CLAUDE.md §5; ADR-010)
    # ------------------------------------------------------------------

    op.execute(text("""
        CREATE INDEX knowledge_embeddings_embedding_idx
            ON knowledge_embeddings
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
    """))

    # ------------------------------------------------------------------
    # 5. Hot-path indexes (additive; DATABASE_FOUNDATION.md §9)
    #    Deferred to P2 migration work per spec.
    # ------------------------------------------------------------------

    # VoC agent fetch: WHERE client_id = $1 AND processed = FALSE (AGENT §7.1)
    op.execute(text("""
        CREATE INDEX raw_feedback_unprocessed_idx
            ON raw_feedback (client_id, processed)
            WHERE processed = FALSE;
    """))

    # Dashboard competitive signal feed: recent unread signals per client
    op.execute(text("""
        CREATE INDEX competitive_signals_client_detected_idx
            ON competitive_signals (client_id, detected_at DESC);
    """))

    # Dashboard VoC summary: latest insight per client
    op.execute(text("""
        CREATE INDEX feedback_insights_client_created_idx
            ON feedback_insights (client_id, created_at DESC);
    """))

    # ------------------------------------------------------------------
    # 6. app_runtime role
    #
    #    A non-superuser, non-owner role used for runtime DB access.
    #    Enables meaningful RLS tests (superusers bypass RLS; SET LOCAL
    #    ROLE app_runtime in a transaction makes RLS apply — MULTI_TENANT §4).
    #    NOLOGIN: connects only via SET ROLE from a superuser session (tests)
    #    or via the application pool (P3 will grant CONNECT at DB level).
    # ------------------------------------------------------------------

    op.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
                CREATE ROLE app_runtime NOLOGIN;
            END IF;
        END $$;
    """))

    op.execute(text("GRANT USAGE ON SCHEMA public TO app_runtime;"))
    op.execute(text(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;"
    ))
    # Ensure future tables added by subsequent migrations are also accessible
    op.execute(text("""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
    """))

    # ------------------------------------------------------------------
    # 7. Row-Level Security
    #
    #    Policy: client_id = current_setting('app.current_client_id', TRUE)::UUID
    #    Fail-closed two ways (L6): if the setting is absent → NULL → client_id = NULL
    #    → FALSE for all rows (no error). If a prior session left the GUC = '', then
    #    ''::UUID raises InvalidTextRepresentationError. Either way access is denied.
    #
    #    FORCE ROW LEVEL SECURITY: applied as defense-in-depth so even the table
    #    owner cannot accidentally bypass policies.  Superusers still bypass RLS
    #    by design; use SET LOCAL ROLE app_runtime in tests to prove isolation.
    #
    #    Applied to:
    #      Required (CLAUDE §5):    raw_feedback, feedback_insights,
    #                               competitive_signals, journey_events,
    #                               journey_insights
    #      Extended (MULTI_TENANT §3 committed default — adopt):
    #                               data_sources, reports
    #      Special (NULL=global):   knowledge_embeddings
    # ------------------------------------------------------------------

    # Standard policy for required + extended tables
    for table in _RLS_CORE + _RLS_EXTENDED:
        op.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;"))
        op.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;"))
        op.execute(text(f"""
            CREATE POLICY client_isolation ON {table}
                USING (client_id = current_setting('app.current_client_id', TRUE)::UUID);
        """))

    # knowledge_embeddings: allow global rows (client_id IS NULL) in addition to
    # the current tenant's rows — preserves NULL=global semantics (DATABASE_FOUNDATION §4)
    op.execute(text("ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;"))
    op.execute(text("ALTER TABLE knowledge_embeddings FORCE ROW LEVEL SECURITY;"))
    op.execute(text("""
        CREATE POLICY client_isolation ON knowledge_embeddings
            USING (
                client_id = current_setting('app.current_client_id', TRUE)::UUID
                OR client_id IS NULL
            );
    """))


def downgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Drop RLS policies and disable RLS on all 8 tables
    # ------------------------------------------------------------------

    for table in _ALL_RLS:
        op.execute(text(f"DROP POLICY IF EXISTS client_isolation ON {table};"))
        op.execute(text(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;"))
        op.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;"))

    # ------------------------------------------------------------------
    # 2. Revoke local grants from app_runtime
    #
    # app_runtime is a PostgreSQL cluster-level role.  Do NOT drop it here: a
    # migration running in another database may also use the same role, and
    # DROP ROLE would fail while cross-database dependencies exist.  Revoke this
    # database's privileges and leave the NOLOGIN role as harmless shared state,
    # matching the extension handling below.
    # ------------------------------------------------------------------

    op.execute(text(
        "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_runtime;"
    ))
    op.execute(text("""
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON TABLES FROM app_runtime;
    """))
    op.execute(text("REVOKE USAGE ON SCHEMA public FROM app_runtime;"))

    # ------------------------------------------------------------------
    # 3. Drop hot-path indexes and ivfflat index
    #    (tables dropped next will cascade, but explicit is cleaner)
    # ------------------------------------------------------------------

    op.execute(text("DROP INDEX IF EXISTS feedback_insights_client_created_idx;"))
    op.execute(text("DROP INDEX IF EXISTS competitive_signals_client_detected_idx;"))
    op.execute(text("DROP INDEX IF EXISTS raw_feedback_unprocessed_idx;"))
    op.execute(text("DROP INDEX IF EXISTS knowledge_embeddings_embedding_idx;"))

    # ------------------------------------------------------------------
    # 4. Drop CHECK constraints
    # ------------------------------------------------------------------

    op.execute(text(
        "ALTER TABLE journey_insights DROP CONSTRAINT IF EXISTS journey_insights_friction_cause_check;"
    ))
    op.execute(text(
        "ALTER TABLE competitive_signals DROP CONSTRAINT IF EXISTS competitive_signals_urgency_check;"
    ))
    op.execute(text(
        "ALTER TABLE feedback_insights DROP CONSTRAINT IF EXISTS feedback_insights_sentiment_label_check;"
    ))
    op.execute(text(
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;"
    ))
    op.execute(text(
        "ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_plan_check;"
    ))

    # ------------------------------------------------------------------
    # 5. Drop tables in safe FK dependency order
    #    (no CASCADE needed when dropping in the right order)
    # ------------------------------------------------------------------

    # These tables reference clients (and each other in the case of raw_feedback→data_sources)
    # but nothing else references them, so drop them first.
    for table in [
        "knowledge_embeddings",
        "reports",
        "journey_insights",
        "journey_events",
        "competitive_signals",
        "feedback_insights",
        "raw_feedback",   # references data_sources — drop before data_sources
        "data_sources",
        "users",
        "clients",        # root; dropped last
    ]:
        op.execute(text(f"DROP TABLE IF EXISTS {table};"))

    # ------------------------------------------------------------------
    # 6. Extensions — intentionally NOT dropped
    #    Extensions are server-level objects that may be shared across
    #    databases on the same cluster.  The next `upgrade head` will
    #    re-create them idempotently via CREATE EXTENSION IF NOT EXISTS.
    # ------------------------------------------------------------------
