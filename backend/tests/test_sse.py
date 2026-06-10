"""
SSE /stream/insights tests (CLAUDE.md §12, §16).

Two layers:
  1. Watermark logic (_fetch_insights_since) under tx_conn — proves a created_at
     watermark emits each new row exactly once and never re-emits history. This is
     the regression guard for the old `WHERE id != $2` logic, which oscillated
     between the two newest rows every 5s once >= 2 insights existed.
  2. Auth — the JWT arrives as a `?token=` query param (EventSource cannot set an
     Authorization header). Missing token -> 422; invalid token -> 401. Both return
     before the (infinite) stream starts, so they are safe to drive with the ASGI
     client; a VALID token is intentionally NOT exercised here (it would stream
     forever and hang the test) — that path is covered by the live E2E run.

DB-dependent tests skip when the database is unreachable. asyncio_mode = auto.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.routers.insights import _fetch_insights_since

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)

_BASE = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)


async def _seed_client(conn: asyncpg.Connection):
    return await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ('SSE', 'sse@sse-test.com') RETURNING id;"
    )


async def _insert_insight(conn, client_id, narrative, created_at):
    await conn.execute(
        "INSERT INTO feedback_insights (client_id, narrative, created_at) VALUES ($1, $2, $3);",
        client_id, narrative, created_at,
    )


# ---------------------------------------------------------------------------
# Watermark logic
# ---------------------------------------------------------------------------

class TestSseWatermark:
    async def test_no_rows_strictly_after_watermark(self, tx_conn: asyncpg.Connection):
        cid = await _seed_client(tx_conn)
        await _insert_insight(tx_conn, cid, "n1", _BASE)
        watermark = await tx_conn.fetchval(
            "SELECT MAX(created_at) FROM feedback_insights WHERE client_id = $1;", cid
        )
        assert await _fetch_insights_since(tx_conn, cid, watermark) == []

    async def test_new_row_emitted_once_then_not_again(self, tx_conn: asyncpg.Connection):
        cid = await _seed_client(tx_conn)
        await _insert_insight(tx_conn, cid, "old", _BASE)
        watermark = _BASE
        await _insert_insight(tx_conn, cid, "new", _BASE + timedelta(minutes=5))

        rows = await _fetch_insights_since(tx_conn, cid, watermark)
        assert [r["narrative"] for r in rows] == ["new"]

        watermark = rows[-1]["created_at"]  # advance
        assert await _fetch_insights_since(tx_conn, cid, watermark) == [], "must not re-emit"

    async def test_no_oscillation_with_multiple_existing_rows(self, tx_conn: asyncpg.Connection):
        """Regression: connecting with >=2 existing insights must not replay them."""
        cid = await _seed_client(tx_conn)
        for i in range(3):
            await _insert_insight(tx_conn, cid, f"n{i}", _BASE + timedelta(minutes=i))
        watermark = await tx_conn.fetchval(
            "SELECT MAX(created_at) FROM feedback_insights WHERE client_id = $1;", cid
        )
        for _ in range(3):  # repeated polls stay empty — no oscillation
            assert await _fetch_insights_since(tx_conn, cid, watermark) == []

    async def test_tenant_scoped(self, tx_conn: asyncpg.Connection):
        """The watermark query is explicitly client-scoped (belt-and-suspenders, §6)."""
        a = await tx_conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ('A', 'sse_a@sse-test.com') RETURNING id;"
        )
        b = await tx_conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ('B', 'sse_b@sse-test.com') RETURNING id;"
        )
        await _insert_insight(tx_conn, b, "b-row", _BASE + timedelta(minutes=5))
        rows = await _fetch_insights_since(tx_conn, a, _BASE)
        assert rows == [], "client A must not see client B's insights"


# ---------------------------------------------------------------------------
# Auth (query-param token) — no DB; both return before streaming
# ---------------------------------------------------------------------------

class TestSseAuth:
    async def test_missing_token_is_422(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/stream/insights")
        assert resp.status_code == 422  # required query param missing

    async def test_invalid_token_is_401(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/stream/insights?token=not.a.valid.jwt")
        assert resp.status_code == 401
