"""add connection_status and connection_error to data_sources

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13

Additive, backward-compatible change (CLAUDE.md §5 — new nullable columns only).
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "data_sources",
        sa.Column(
            "connection_status",
            sa.String(50),
            nullable=False,
            server_default="pending_configuration",
        ),
    )
    op.add_column(
        "data_sources",
        sa.Column("connection_error", sa.Text(), nullable=True),
    )
    # Backfill: rows that already synced successfully → active
    op.execute("""
        UPDATE data_sources
        SET connection_status = 'active'
        WHERE last_synced_at IS NOT NULL AND is_active = TRUE
    """)
    # Rows that are explicitly inactive → disconnected
    op.execute("""
        UPDATE data_sources
        SET connection_status = 'disconnected'
        WHERE is_active = FALSE
    """)


def downgrade() -> None:
    op.drop_column("data_sources", "connection_error")
    op.drop_column("data_sources", "connection_status")
