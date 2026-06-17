"""realtime_events_table

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-18 01:28:21.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""
        CREATE TABLE realtime_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
            event_type VARCHAR(100) NOT NULL,
            entity_id VARCHAR(255),
            payload JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    op.execute("""
        ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;
    """)
    op.execute("""
        CREATE POLICY client_isolation ON realtime_events
            USING (client_id = current_setting('app.current_client_id')::UUID);
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION notify_realtime_event() RETURNS TRIGGER AS $$
        DECLARE
            payload JSON;
        BEGIN
            payload = json_build_object(
                'id', NEW.id,
                'client_id', NEW.client_id,
                'event_type', NEW.event_type,
                'entity_id', NEW.entity_id,
                'payload', NEW.payload,
                'created_at', NEW.created_at
            );
            PERFORM pg_notify('realtime_events_channel', payload::text);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER realtime_events_notify_trigger
        AFTER INSERT ON realtime_events
        FOR EACH ROW EXECUTE FUNCTION notify_realtime_event();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS realtime_events_notify_trigger ON realtime_events;")
    op.execute("DROP FUNCTION IF EXISTS notify_realtime_event();")
    op.execute("DROP TABLE realtime_events;")
