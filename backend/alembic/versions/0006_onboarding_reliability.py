"""onboarding & reliability — user_invites, agent_jobs, rate_limits

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-16

Additive, backward-compatible (CLAUDE.md §5 — new tables only; no existing
table, column, or policy is renamed, retyped, or dropped).

Closes the gaps surfaced by the June 2026 launch audit (Phase 1 & 6):
  - user_invites  — invite-only onboarding (Phase 1): admin issues a
                    token-protected invite; invitee sets a password and
                    accepts; a users row is created. token_hash is stored
                    (never the raw token), expires_at enforces TTL.
  - agent_jobs    — reliability DLQ (Phase 6): every agent run is tracked
                    (status: queued → running → succeeded/failed → dead after
                    max_attempts). Enables admin System panel + retry sweeper.
  - rate_limits   — Postgres-backed distributed rate limiting (Phase 8):
                    replaces the in-process dict in main.py; correct across
                    ECS tasks without Redis.

RLS:
  - user_invites  is NOT RLS-enabled; it is accessed before a tenant context
                  exists (token-based lookup during accept flow). Tenant
                  isolation is enforced by the client_id FK + explicit filter
                  in every query.
  - agent_jobs    IS RLS-enabled; every job is tenant-scoped and surfaced in
                  the admin System panel (same pattern as feedback_insights).
  - rate_limits   is NOT RLS-enabled; it is a shared counter table keyed by
                  (key, window_start); queried before tenant context.
"""

from alembic import op
from sqlalchemy import text

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. user_invites — invite-only onboarding
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE user_invites (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            email       VARCHAR(255) NOT NULL,
            role        VARCHAR(50)  NOT NULL DEFAULT 'analyst',
            token_hash  TEXT         NOT NULL UNIQUE,
            invited_by  UUID,
            expires_at  TIMESTAMPTZ  NOT NULL,
            accepted_at TIMESTAMPTZ,
            created_at  TIMESTAMPTZ  DEFAULT NOW()
        );
    """))
    op.execute(text(
        "CREATE INDEX user_invites_token_hash_idx ON user_invites (token_hash);"
    ))
    op.execute(text(
        "CREATE INDEX user_invites_client_id_idx ON user_invites (client_id);"
    ))

    # ------------------------------------------------------------------
    # 2. agent_jobs — reliability / DLQ
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE agent_jobs (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            job_type      VARCHAR(100) NOT NULL,
            status        VARCHAR(50)  NOT NULL DEFAULT 'queued',
            attempts      INT          NOT NULL DEFAULT 0,
            max_attempts  INT          NOT NULL DEFAULT 3,
            last_error    TEXT,
            next_retry_at TIMESTAMPTZ,
            started_at    TIMESTAMPTZ,
            completed_at  TIMESTAMPTZ,
            created_at    TIMESTAMPTZ  DEFAULT NOW()
        );
    """))
    op.execute(text(
        "CREATE INDEX agent_jobs_client_status_idx ON agent_jobs (client_id, status);"
    ))
    op.execute(text(
        "CREATE INDEX agent_jobs_next_retry_idx ON agent_jobs (next_retry_at) "
        "WHERE status = 'failed';"
    ))

    # RLS: agent_jobs is tenant-scoped (same pattern as feedback_insights)
    op.execute(text("ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;"))
    op.execute(text("""
        CREATE POLICY client_isolation ON agent_jobs
            USING (client_id = current_setting('app.current_client_id')::UUID);
    """))

    # ------------------------------------------------------------------
    # 3. rate_limits — Postgres token-bucket
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE rate_limits (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            rate_key     VARCHAR(512) NOT NULL,
            window_start TIMESTAMPTZ  NOT NULL,
            count        INT          NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ  DEFAULT NOW(),
            UNIQUE (rate_key, window_start)
        );
    """))
    op.execute(text(
        "CREATE INDEX rate_limits_key_window_idx ON rate_limits (rate_key, window_start);"
    ))

    # ------------------------------------------------------------------
    # 4. Grant runtime privileges on all new tables to app_runtime
    # ------------------------------------------------------------------
    op.execute(text(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON "
        "user_invites, agent_jobs, rate_limits TO app_runtime;"
    ))


def downgrade() -> None:
    op.execute(text("DROP TABLE IF EXISTS rate_limits;"))
    op.execute(text("DROP TABLE IF EXISTS agent_jobs;"))
    op.execute(text("DROP TABLE IF EXISTS user_invites;"))
