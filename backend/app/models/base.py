"""
Declarative base for all SQLAlchemy ORM models (migration/typing mirrors only — D2, AUD-03).

Isolated in its own module to avoid circular imports when model files import Base.
All model files import from here, not from app.models.__init__.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
