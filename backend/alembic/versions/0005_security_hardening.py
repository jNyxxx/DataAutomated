"""security hardening — token_denylist, sse_tickets, login_attempts, app_login role

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-15

Additive, backward-compatible change (CLAUDE.md §5 — new tables + a new cluster role
only; no existing table/column is renamed, retyped, or dropped).

Closes the cross-instance gaps surfaced by the June 2026 launch audit:
  - SR-01  token_denylist  — JWT revocation list shared across ECS tasks.
  - SR-02  sse_tickets     — short-lived SSE tickets in Postgres (was in-process memory).
  - P3-02  login_attempts  — account-lockout counters shared across ECS tasks.
  - M1     app_login role  — a LOGIN, NON-superuser, NOBYPASSRLS role so RLS is the
                             default even on a raw pool checkout. Ops sets the password
                             out-of-band (Secrets Manager) and points DATABASE_DSN at it;
                             see SECURITY_REMEDIATION.md (M1). No secret is stored here.

RLS NOTE: token_denylist, sse_tickets and login_attempts are intentionally NOT
RLS-enabled. They are authentication-infrastructure tables queried *before* a tenant
context exists (revocation check and ticket exchange both run before
`app.current_client_id` is set), exactly like `users`/`clients`. Their keys (jti, ticket,
email) are unguessable or non-sensitive, so no tenant data is exposed. Access is still
limited to the runtime role via explicit GRANTs below.
"""

from alembic import op
from sqlalchemy import text

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. token_denylist (SR-01) — JWT revocation list
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE token_denylist (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            jti        UUID UNIQUE NOT NULL,
            user_id    UUID,
            client_id  UUID,
            reason     VARCHAR(50),          -- 'logout' | 'forced_logout' | 'rotation'
            expires_at TIMESTAMPTZ NOT NULL, -- = token exp; rows past this are purgeable
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """))
    # Cleanup query (n8n/cron) prunes WHERE expires_at < NOW().
    op.execute(text(
        "CREATE INDEX token_denylist_expires_idx ON token_denylist (expires_at);"
    ))

    # ------------------------------------------------------------------
    # 2. sse_tickets (SR-02) — short-lived single-use SSE access tickets
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE sse_tickets (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ticket     TEXT UNIQUE NOT NULL,
            client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            user_id    UUID,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """))
    op.execute(text(
        "CREATE INDEX sse_tickets_expires_idx ON sse_tickets (expires_at);"
    ))

    # ------------------------------------------------------------------
    # 3. login_attempts (P3-02) — account-lockout counters (per email)
    # ------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE login_attempts (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            identifier      VARCHAR(255) UNIQUE NOT NULL,  -- lowercased email
            failed_count    INT NOT NULL DEFAULT 0,
            first_failed_at TIMESTAMPTZ,
            last_failed_at  TIMESTAMPTZ,
            locked_until    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );
    """))
    op.execute(text(
        "CREATE INDEX login_attempts_locked_idx ON login_attempts (locked_until);"
    ))

    # ------------------------------------------------------------------
    # 4. Grant runtime privileges on the new tables to app_runtime
    #    (ALTER DEFAULT PRIVILEGES from 0001 should cover this, but explicit
    #     grants are belt-and-suspenders and survive owner changes.)
    # ------------------------------------------------------------------
    op.execute(text(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON "
        "token_denylist, sse_tickets, login_attempts TO app_runtime;"
    ))

    # ------------------------------------------------------------------
    # 5. app_login role (M1) — a LOGIN, non-superuser, non-BYPASSRLS role.
    #
    #    Today the pool connects as the superuser owner and relies on
    #    `SET LOCAL ROLE app_runtime` (database.py) for RLS to apply. This role
    #    lets ops make RLS the *default* even on a raw pool.acquire(): app_login
    #    inherits app_runtime's table privileges (role membership, INHERIT on by
    #    default) but cannot bypass RLS and is not a superuser.
    #
    #    NO PASSWORD is set here (CLAUDE.md §14 — never store secrets in VCS).
    #    To activate (documented residual in SECURITY_REMEDIATION.md M1):
    #      ALTER ROLE app_login PASSWORD '<from Secrets Manager>';
    #      -- then point DATABASE_DSN at app_login and redeploy.
    # ------------------------------------------------------------------
    op.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_login') THEN
                CREATE ROLE app_login LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
            END IF;
            EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_login', current_database());
        END $$;
    """))
    # Membership → inherits SELECT/INSERT/UPDATE/DELETE + schema USAGE from app_runtime,
    # and is permitted to `SET ROLE app_runtime` inside acquire_for_client().
    op.execute(text("GRANT app_runtime TO app_login;"))


def downgrade() -> None:
    # app_login is a cluster-level role (may be shared across databases) — revoke this
    # database's grants and membership but do NOT DROP it, matching the app_runtime
    # handling in 0001.
    op.execute(text("REVOKE app_runtime FROM app_login;"))
    op.execute(text("""
        DO $$ BEGIN
            EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM app_login', current_database());
        EXCEPTION WHEN undefined_object THEN
            NULL;
        END $$;
    """))

    op.execute(text("DROP INDEX IF EXISTS login_attempts_locked_idx;"))
    op.execute(text("DROP INDEX IF EXISTS sse_tickets_expires_idx;"))
    op.execute(text("DROP INDEX IF EXISTS token_denylist_expires_idx;"))
    op.execute(text("DROP TABLE IF EXISTS login_attempts;"))
    op.execute(text("DROP TABLE IF EXISTS sse_tickets;"))
    op.execute(text("DROP TABLE IF EXISTS token_denylist;"))
