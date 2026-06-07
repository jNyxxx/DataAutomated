"""
SQLAlchemy ORM models — migration/typing mirrors only (D2, AUD-03).

Base and all model classes are exported from here. Alembic env.py imports
`Base` (for target_metadata) and the model classes (to register tables with
Base.metadata before Alembic compares against the live DB).

Runtime data path: raw asyncpg via database.py (P3). These models are NOT
used for runtime queries.
"""

from app.models.base import Base  # noqa: F401

# Import all model classes to register their __tablename__ with Base.metadata.
# Order matters for FK resolution: parent tables before child tables.
from app.models.client import Client, DataSource, Report, User  # noqa: F401
from app.models.insight import (  # noqa: F401
    FeedbackInsight,
    KnowledgeEmbedding,
    RawFeedback,
)
from app.models.signal import CompetitiveSignal  # noqa: F401
from app.models.journey import JourneyEvent, JourneyInsight  # noqa: F401

__all__ = [
    "Base",
    # Client management
    "Client",
    "User",
    "DataSource",
    "Report",
    # VoC / insight
    "RawFeedback",
    "FeedbackInsight",
    "KnowledgeEmbedding",
    # Competitive signals
    "CompetitiveSignal",
    # Journey
    "JourneyEvent",
    "JourneyInsight",
]
