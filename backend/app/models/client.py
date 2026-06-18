"""
Client, User, DataSource, Report ORM models (CLAUDE.md §5).

Migration/typing mirrors only (D2, AUD-03). NOT a runtime query path.
All runtime access uses raw asyncpg through the shared pool in database.py (P3).

Tables owned by this file:
  clients      — one row per DataAutomated.io customer
  users        — client team members who access the portal
  data_sources — client's connected tools; credentials stored as AES-256 ciphertext (SR-04)
  reports      — generated PDFs and dashboards, stored in S3
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, String, Text, text
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Client(Base):
    """One row per DataAutomated.io customer (root tenant; not itself tenant-scoped)."""

    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # plan ∈ {insight_starter, intelligence_core, strategic_suite, enterprise} — CHECK in migration
    plan: Mapped[Optional[str]] = mapped_column(
        String(50), server_default=text("'insight_starter'"), nullable=True
    )
    api_key: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
    is_active: Mapped[Optional[bool]] = mapped_column(
        Boolean, server_default=text("TRUE"), nullable=True
    )


class User(Base):
    """Client team member who accesses the portal. hashed_password = bcrypt (SR-01)."""

    __tablename__ = "users"

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
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    # role ∈ {admin, analyst, viewer} — CHECK in migration
    role: Mapped[Optional[str]] = mapped_column(
        String(50), server_default=text("'viewer'"), nullable=True
    )
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )


class DataSource(Base):
    """
    Client's connected data tool.

    credentials JSONB stores AES-256 ciphertext only (SR-04).
    Plaintext credentials are never persisted; decryption happens only in MCP tools (P5).
    Use credential_encryption.encrypt_credentials / decrypt_credentials.
    """

    __tablename__ = "data_sources"

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
    # source_type ∈ {'zendesk', 'typeform', 'mixpanel', 'intercom', ...}
    source_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Encrypted ciphertext — use credential_encryption.py to read/write (SR-04)
    credentials: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    last_synced_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    is_active: Mapped[Optional[bool]] = mapped_column(
        Boolean, server_default=text("TRUE"), nullable=True
    )
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )


class Report(Base):
    """Generated PDF / dashboard report; s3_key points to the object in S3."""

    __tablename__ = "reports"

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
    # report_type ∈ {'weekly_voc', 'competitive_brief', 'journey', 'weekly_intelligence', ...}
    report_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    s3_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    period_start: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    period_end: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[Optional[object]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=True
    )
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
