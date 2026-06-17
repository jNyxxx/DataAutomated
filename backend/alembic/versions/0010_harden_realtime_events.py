"""harden realtime_events

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-18 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. FORCE ROW LEVEL SECURITY to ensure table owner/superuser bypasses are harder
    op.execute("ALTER TABLE realtime_events FORCE ROW LEVEL SECURITY;")
    
    # 2. Replace the policy with a safe missing-ok version (TRUE flag on current_setting)
    op.execute("DROP POLICY IF EXISTS client_isolation ON realtime_events;")
    op.execute("""
        CREATE POLICY client_isolation ON realtime_events
        AS PERMISSIVE FOR ALL
        TO public
        USING (client_id = NULLIF(current_setting('app.current_client_id', TRUE), '')::UUID)
        WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', TRUE), '')::UUID);
    """)

    # 3. Grant runtime privileges so app_runtime (and app_login) can insert/select
    op.execute("GRANT SELECT, INSERT ON realtime_events TO app_runtime;")

    # 4. Add index for fast catch-up queries by client_id and created_at
    op.execute("CREATE INDEX IF NOT EXISTS idx_realtime_events_catchup ON realtime_events (client_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_realtime_events_type ON realtime_events (event_type);")

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_realtime_events_type;")
    op.execute("DROP INDEX IF EXISTS idx_realtime_events_catchup;")
    
    # Revoke runtime privileges
    op.execute("REVOKE SELECT, INSERT ON realtime_events FROM app_runtime;")

    # Revert to unsafe policy
    op.execute("DROP POLICY IF EXISTS client_isolation ON realtime_events;")
    op.execute("""
        CREATE POLICY client_isolation ON realtime_events
        USING (client_id = current_setting('app.current_client_id')::UUID);
    """)

    # Remove force RLS
    op.execute("ALTER TABLE realtime_events NO FORCE ROW LEVEL SECURITY;")
