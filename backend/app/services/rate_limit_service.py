"""
Distributed rate limiter backed by PostgreSQL (CLAUDE.md §14, Phase 8).

Replaces the in-process ``_rate_limit_store`` dict in ``main.py`` so limits
are shared correctly across multiple ECS task instances without Redis.

Uses a fixed-window counter with atomic INSERT … ON CONFLICT.

Schema (migration 0006):
    rate_limits(rate_key VARCHAR(512), window_start TIMESTAMPTZ, count INT)
    UNIQUE (rate_key, window_start)
"""
from __future__ import annotations

from datetime import datetime, timezone


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """
    Atomically increment the request counter for *key* in the current window.

    Returns True (allow) when count ≤ max_requests; False (rate-limited) otherwise.
    Callers should treat any exception as "allow" (fail-open) so that a DB outage
    does not block all traffic.
    """
    from app.database import _db  # late import — pool not available at module load

    now = datetime.now(timezone.utc)
    epoch = now.timestamp()
    # Floor to the start of the current fixed window
    window_start = datetime.fromtimestamp(epoch - (epoch % window_seconds), tz=timezone.utc)

    row = await _db.pool.fetchrow(
        """
        INSERT INTO rate_limits (rate_key, window_start, count)
        VALUES ($1, $2, 1)
        ON CONFLICT (rate_key, window_start)
        DO UPDATE SET count = rate_limits.count + 1
        RETURNING count
        """,
        key,
        window_start,
    )
    return (row["count"] if row else 1) <= max_requests
