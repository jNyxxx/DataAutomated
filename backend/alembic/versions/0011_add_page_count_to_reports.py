"""add page_count to reports

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add page_count column to reports
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS page_count INTEGER;")

def downgrade() -> None:
    op.execute("ALTER TABLE reports DROP COLUMN IF NOT EXISTS page_count;")
