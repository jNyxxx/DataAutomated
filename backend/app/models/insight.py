"""
RawFeedback, FeedbackInsight, KnowledgeEmbedding ORM models (CLAUDE.md §5).

Migration/typing mirrors only (D2, AUD-03). NOT a runtime query path.
All runtime access uses raw asyncpg through the shared pool in database.py (P3).

Tables owned by this file:
  raw_feedback        — ingested customer feedback; drained after processing (SYSTEM §4.2)
  feedback_insights   — VoC agent output; the durable insight record (CLAUDE.md §14)
  knowledge_embeddings — RAG knowledge base; client_id IS NULL = global knowledge (ADR-010)
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import ARRAY, Boolean, ForeignKey, Text, text
from sqlalchemy import TIMESTAMP, Float, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.models.base import Base


class RawFeedback(Base):
    """
    Raw ingested customer feedback from any source.

    processed flag = ingestion ↔ analysis handoff (SYSTEM §4.2).
    Drained/aged after processing — not a permanent store (DATABASE_FOUNDATION §8).
    source_id references data_sources with NO CASCADE (preserve as written per spec).
    """

    __tablename__ = "raw_feedback"

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
    # NO ondelete cascade on source_id — preserve as written (DATABASE_FOUNDATION §2)
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=True,
    )
    source_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # metadata: author, timestamp, rating, channel
    # Attribute renamed to metadata_ — 'metadata' is reserved by SQLAlchemy's Declarative API.
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    ingested_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
    processed: Mapped[Optional[bool]] = mapped_column(
        Boolean, server_default=text("FALSE"), nullable=True
    )


class FeedbackInsight(Base):
    """
    VoC agent output — the durable insight record.

    feedback_ids traces which raw_feedback rows were analysed.
    sentiment_score ∈ [-1.0, 1.0]; urgency_score, churn_risk ∈ [0.0, 1.0].
    sentiment_label ∈ {positive, negative, neutral, mixed} — CHECK in migration.
    """

    __tablename__ = "feedback_insights"

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
    feedback_ids: Mapped[Optional[list]] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=True
    )
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # sentiment_label ∈ {positive, negative, neutral, mixed}
    sentiment_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    urgency_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # themes: [{"theme": "onboarding", "count": 42, ...}]
    themes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    churn_risk: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    period_start: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    period_end: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )


class KnowledgeEmbedding(Base):
    """
    RAG knowledge base.

    client_id IS NULL = global knowledge (available to all tenants).
    client_id set = client-specific knowledge.
    No ON DELETE CASCADE — preserve nullable FK without cascade (DATABASE_FOUNDATION §2).
    embedding is vector(1536) matching text-embedding-3-small (ADR-010; CLAUDE §3).
    The ivfflat cosine index (lists=100) is created in the P2 migration.
    """

    __tablename__ = "knowledge_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    # Nullable, NO cascade — NULL = global knowledge (DATABASE_FOUNDATION §2, §4)
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # vector(1536) — matches text-embedding-3-small; ivfflat cosine index in migration
    embedding: Mapped[Optional[list]] = mapped_column(Vector(1536), nullable=True)
    # Attribute renamed to metadata_ — 'metadata' is reserved by SQLAlchemy's Declarative API.
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
