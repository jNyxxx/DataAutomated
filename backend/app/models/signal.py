"""
CompetitiveSignal ORM model (CLAUDE.md §5).

Migration/typing mirror only (D2, AUD-03). NOT a runtime query path.
All runtime access uses raw asyncpg through the shared pool in database.py (P3).

Tables owned by this file:
  competitive_signals — CompSig agent output; one row per detected competitor signal
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Text, text
from sqlalchemy import TIMESTAMP, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CompetitiveSignal(Base):
    """
    Competitive Signal Engine output.

    urgency ∈ {critical, high, medium, low} — CHECK in migration.
    signal_type ∈ {pricing, product_launch, hiring, ...}.
    is_read drives portal UX (unread badge, alert triage).
    Uses detected_at (not created_at) as the canonical timestamp (per CLAUDE §5 spec).
    """

    __tablename__ = "competitive_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True,
    )
    competitor_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # signal_type ∈ {pricing, product_launch, hiring, ...}
    signal_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    signal_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    raw_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategic_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # urgency ∈ {critical, high, medium, low}
    urgency: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    detected_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
    is_read: Mapped[Optional[bool]] = mapped_column(
        Boolean, server_default=text("FALSE"), nullable=True
    )
