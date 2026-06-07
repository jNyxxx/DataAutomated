"""
JourneyEvent and JourneyInsight ORM models (CLAUDE.md §5).

Migration/typing mirrors only (D2, AUD-03). NOT a runtime query path.
All runtime access uses raw asyncpg through the shared pool in database.py (P3).

Tables owned by this file:
  journey_events   — raw behavioral events; ingested from MCP tools (Mixpanel, Segment, Shopify)
  journey_insights — Behavioral Journey agent output; the durable insight record
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Text, text
from sqlalchemy import TIMESTAMP, Float, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JourneyEvent(Base):
    """
    Raw behavioral event from any tracking source.

    occurred_at = source timestamp; ingested_at = pipeline arrival time.
    event_type ∈ {page_view, click, form_start, abandon, ...}.
    Drained/aged after processing (working data, not a permanent store).
    """

    __tablename__ = "journey_events"

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
    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # event_type ∈ {page_view, click, form_start, abandon, ...}
    event_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    properties: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    occurred_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    ingested_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )


class JourneyInsight(Base):
    """
    Behavioral Journey agent output — the durable insight record.

    friction_cause ∈ {ux_friction, messaging, expectation} — CHECK in migration.
    drop_off_rate, friction_score, projected_lift are normalised FLOATs.
    """

    __tablename__ = "journey_insights"

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
    funnel_step: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    drop_off_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    friction_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # friction_cause ∈ {ux_friction, messaging, expectation}
    friction_cause: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    projected_lift: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
