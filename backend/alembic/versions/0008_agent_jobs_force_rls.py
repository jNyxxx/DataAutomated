"""Force row level security on agent_jobs

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-17

Migration 0007 added ENABLE ROW LEVEL SECURITY and the client_isolation policy
on agent_jobs but omitted FORCE ROW LEVEL SECURITY. All other tenant tables have
both. FORCE ensures that direct psql admin connections (table owner / superuser)
also obey the policy — defense-in-depth per CLAUDE.md §5.
"""

from alembic import op
from sqlalchemy import text

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("ALTER TABLE agent_jobs FORCE ROW LEVEL SECURITY;"))


def downgrade() -> None:
    op.execute(text("ALTER TABLE agent_jobs NO FORCE ROW LEVEL SECURITY;"))
