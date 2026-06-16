"""Fix agent_jobs RLS policy to use current_setting with missing_ok=true

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-16

The client_isolation policy on agent_jobs was created without the missing_ok
flag on current_setting(), causing an UndefinedObjectError when the
app.current_client_id GUC has never been set in the connection (e.g., in
read-only health checks or test connections that only SET LOCAL ROLE).
All other tables' policies (raw_feedback, feedback_insights, etc.) correctly
use current_setting('app.current_client_id', TRUE) — this migration aligns
agent_jobs to the same pattern.

Additive: drops and recreates the policy expression only; table data and
the ENABLE ROW LEVEL SECURITY setting are untouched.
"""

from alembic import op
from sqlalchemy import text

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("DROP POLICY IF EXISTS client_isolation ON agent_jobs;"))
    op.execute(text("""
        CREATE POLICY client_isolation ON agent_jobs
            USING (client_id = current_setting('app.current_client_id', TRUE)::UUID);
    """))


def downgrade() -> None:
    op.execute(text("DROP POLICY IF EXISTS client_isolation ON agent_jobs;"))
    op.execute(text("""
        CREATE POLICY client_isolation ON agent_jobs
            USING (client_id = current_setting('app.current_client_id')::UUID);
    """))
