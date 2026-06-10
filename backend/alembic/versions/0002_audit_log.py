"""Audit trail — audit_log table for data access + AI agent actions (CLAUDE.md §14).

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-11

Additive, backward-compatible change (permitted without a schema ruling per §5):
  - audit_log follows every convention: UUID PK via uuid_generate_v4(),
    TIMESTAMPTZ created_at, client_id FK with ON DELETE CASCADE, JSONB detail.
  - client_id is NULLABLE: NULL marks system-level events with no tenant context
    (e.g. failed logins for unknown users) — mirrors the knowledge_embeddings
    nullable-tenant pattern, but WITHOUT the "NULL is readable by everyone"
    semantics (see policy split below).
  - Append-only by policy: under the app_runtime role there is a SELECT policy
    and an INSERT policy but deliberately NO UPDATE/DELETE policy, so tenant-
    scoped connections can never rewrite history.
      * SELECT: own-tenant rows only (system NULL rows are NOT tenant-readable).
      * INSERT: own-tenant rows, or NULL client_id for system events.

Downgrade drops the policies, RLS state, index, and table.
"""

from alembic import op
from sqlalchemy import text

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("""
        CREATE TABLE audit_log (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
            actor       VARCHAR(255),
            action      VARCHAR(100) NOT NULL,
            resource    VARCHAR(255),
            detail      JSONB,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    """))

    # Hot path: per-client audit review, newest first (same shape as the
    # feedback_insights / competitive_signals dashboard indexes in 0001).
    op.execute(text("""
        CREATE INDEX audit_log_client_created_idx
            ON audit_log (client_id, created_at DESC);
    """))

    # RLS — fail-closed missing_ok pattern from 0001. FORCE so the table owner
    # is also bound (superusers still bypass by design; tests use app_runtime).
    op.execute(text("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;"))
    op.execute(text("ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;"))

    op.execute(text("""
        CREATE POLICY client_isolation ON audit_log
            FOR SELECT
            USING (client_id = current_setting('app.current_client_id', TRUE)::UUID);
    """))
    op.execute(text("""
        CREATE POLICY audit_insert ON audit_log
            FOR INSERT
            WITH CHECK (
                client_id = current_setting('app.current_client_id', TRUE)::UUID
                OR client_id IS NULL
            );
    """))
    # No UPDATE/DELETE policies on purpose: audit_log is append-only for
    # app_runtime — RLS denies commands that have no permissive policy.

    # app_runtime table privileges arrive via the ALTER DEFAULT PRIVILEGES
    # grant in 0001, but make it explicit in case defaults were altered.
    op.execute(text(
        "GRANT SELECT, INSERT ON audit_log TO app_runtime;"
    ))


def downgrade() -> None:
    op.execute(text("DROP POLICY IF EXISTS audit_insert ON audit_log;"))
    op.execute(text("DROP POLICY IF EXISTS client_isolation ON audit_log;"))
    op.execute(text("ALTER TABLE audit_log NO FORCE ROW LEVEL SECURITY;"))
    op.execute(text("ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;"))
    op.execute(text("DROP INDEX IF EXISTS audit_log_client_created_idx;"))
    op.execute(text("DROP TABLE IF EXISTS audit_log;"))
