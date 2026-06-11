"""Idempotency constraint on reports — prevent duplicate rows for the same PDF.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-11

Additive, backward-compatible change (permitted without a schema ruling per §5).

The reports table previously allowed multiple rows for the same (client_id, s3_key).
Since s3_key is deterministic per client+report_type+date, a second trigger on the
same day overwrites the S3 object but inserts a second DB row, creating two presigned
URLs for the same object and opening the door to duplicate weekly emails.

Fix: UNIQUE constraint on (client_id, s3_key).  generate_report now uses
ON CONFLICT (client_id, s3_key) DO NOTHING — the second trigger's INSERT silently
no-ops, the pre-allocated report_id is never committed, WF03's pinned fetch returns
null → routes to the safe-skip branch, never sends a duplicate email.

The s3_key format is {client_id}/{report_type}_{date}.pdf — one row per client per
report type per calendar day at steady state.  An admin can force a re-send by
deleting the existing row before re-triggering.

Downgrade removes the constraint (index drops automatically).
"""

from alembic import op
from sqlalchemy import text

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: skip if the constraint already exists (e.g. applied manually in dev).
    op.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'reports_client_s3key_unique'
            ) THEN
                ALTER TABLE reports
                    ADD CONSTRAINT reports_client_s3key_unique
                    UNIQUE (client_id, s3_key);
            END IF;
        END
        $$;
    """))


def downgrade() -> None:
    op.execute(text(
        "ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_client_s3key_unique"
    ))
