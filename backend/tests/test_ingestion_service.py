"""
Phase 5b — MCP ingestion pipeline tests (CLAUDE.md §8, §13, §16).

run_ingestion dispatches connected VoC/Journey tools and persists their
normalized output to raw_feedback / journey_events.  Tools are mocked
(no network); the DB is real — tests skip if it is unreachable.
asyncio_mode = auto (pytest.ini).
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)

try:
    import asyncpg as _asyncpg_mod  # noqa: F401
    _asyncpg_available = True
except ImportError:
    _asyncpg_available = False

from app.database import close_pool, init_pool


@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping ingestion DB tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    if not _asyncpg_available:
        pytest.skip("asyncpg not installed.")
    import asyncpg
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}).")
    yield conn
    await conn.close()


async def _seed_client(conn, suffix: str):
    return await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"Ingest Test {suffix}",
        f"ingest_{suffix}@test.com",
    )


async def _seed_source(conn, client_id, source_type: str, config: str | None = None):
    return await conn.fetchval(
        "INSERT INTO data_sources (client_id, source_type, config, is_active) "
        "VALUES ($1, $2, $3::jsonb, TRUE) RETURNING id",
        client_id, source_type, config,
    )


async def _cleanup(conn, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM raw_feedback WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM journey_events WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM data_sources WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM clients WHERE id = $1", cid)


def _mock_tool(name: str, category: str, records: list[dict]) -> MagicMock:
    tool = MagicMock()
    tool.name = name
    tool.category = category
    tool.arun = AsyncMock(return_value=records)
    # _config_args inspects args_schema.model_fields — mimic a minimal schema.
    tool.args_schema = MagicMock()
    tool.args_schema.model_fields = {"client_id": None, "since_hours": None}
    return tool


_VOC_RECORDS = [
    {"id": "z1", "content": "App keeps crashing on export",
     "metadata": {"subject": "Crash", "source_type": "zendesk"}},
    {"id": "z2", "content": "",  # empty content must be skipped (NOT NULL)
     "metadata": {"source_type": "zendesk"}},
]

_JOURNEY_RECORDS = [
    {"id": "m1", "content": "page_view",
     "metadata": {"session_id": "s1", "user_id": "u1", "event_type": "page_view",
                  "occurred_at": "2026-06-01T10:00:00+00:00",
                  "properties": {"$current_url": "/signup"}, "source_type": "mixpanel"}},
    {"id": "m2", "content": "form_start",
     "metadata": {"session_id": "s1", "user_id": "u1", "event_type": "form_start",
                  "occurred_at": "2026-06-01T10:01:00+00:00",
                  "properties": {}, "source_type": "mixpanel"}},
]


async def test_ingestion_persists_feedback_and_events(db_pool, admin_conn):
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk")
        await _seed_source(admin_conn, client_id, "mixpanel")

        registry = {
            "zendesk": _mock_tool("fetch_zendesk_feedback", "voc", _VOC_RECORDS),
            "mixpanel": _mock_tool("fetch_mixpanel_events", "journey", _JOURNEY_RECORDS),
        }
        with patch("app.services.ingestion_service.TOOL_REGISTRY", registry):
            result = await run_ingestion(client_id)

        assert result["ingestion_count"] == 1          # empty-content record skipped
        assert result["journey_event_count"] == 2
        assert set(result["sources_processed"]) == {"zendesk", "mixpanel"}

        fb = await admin_conn.fetch(
            "SELECT source_type, external_id, content, processed FROM raw_feedback "
            "WHERE client_id = $1", client_id,
        )
        assert len(fb) == 1
        assert fb[0]["external_id"] == "z1"
        assert fb[0]["processed"] is False

        ev = await admin_conn.fetch(
            "SELECT session_id, event_type, occurred_at FROM journey_events "
            "WHERE client_id = $1 ORDER BY occurred_at", client_id,
        )
        assert [r["event_type"] for r in ev] == ["page_view", "form_start"]
        assert ev[0]["session_id"] == "s1"
        assert ev[0]["occurred_at"] is not None
    finally:
        await _cleanup(admin_conn, client_id)


async def test_ingestion_is_idempotent_across_overlapping_runs(db_pool, admin_conn):
    """n8n fires every 6h over a 24h fetch window — re-runs must not duplicate."""
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk")
        await _seed_source(admin_conn, client_id, "mixpanel")

        registry = {
            "zendesk": _mock_tool("fetch_zendesk_feedback", "voc", _VOC_RECORDS),
            "mixpanel": _mock_tool("fetch_mixpanel_events", "journey", _JOURNEY_RECORDS),
        }
        with patch("app.services.ingestion_service.TOOL_REGISTRY", registry):
            first = await run_ingestion(client_id)
            second = await run_ingestion(client_id)

        assert first["ingestion_count"] == 1
        assert second["ingestion_count"] == 0
        assert second["journey_event_count"] == 0

        n_fb = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM raw_feedback WHERE client_id = $1", client_id)
        n_ev = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM journey_events WHERE client_id = $1", client_id)
        assert n_fb == 1
        assert n_ev == 2
    finally:
        await _cleanup(admin_conn, client_id)


async def test_ingestion_skips_compsig_and_unknown_sources(db_pool, admin_conn):
    """CompSig tools belong to mine_signals_node, not ingestion; unknown types skip."""
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "news")
        await _seed_source(admin_conn, client_id, "unknown_vendor_xyz")

        news_tool = _mock_tool("search_news_signals", "compsig", [{"id": "n1"}])
        with patch("app.services.ingestion_service.TOOL_REGISTRY", {"news": news_tool}):
            result = await run_ingestion(client_id)

        assert result == {
            "ingestion_count": 0,
            "journey_event_count": 0,
            "sources_processed": [],
        }
        news_tool.arun.assert_not_called()
    finally:
        await _cleanup(admin_conn, client_id)


async def test_ingestion_tolerates_tool_failure(db_pool, admin_conn):
    """One tool blowing up must not lose the other tools' rows (RISK-10)."""
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk")
        await _seed_source(admin_conn, client_id, "mixpanel")

        failing = _mock_tool("fetch_zendesk_feedback", "voc", [])
        failing.arun = AsyncMock(side_effect=Exception("vendor API down"))
        registry = {
            "zendesk": failing,
            "mixpanel": _mock_tool("fetch_mixpanel_events", "journey", _JOURNEY_RECORDS),
        }
        with patch("app.services.ingestion_service.TOOL_REGISTRY", registry):
            result = await run_ingestion(client_id)

        assert result["ingestion_count"] == 0
        assert result["journey_event_count"] == 2
        assert result["sources_processed"] == ["mixpanel"]
    finally:
        await _cleanup(admin_conn, client_id)


async def test_ingestion_passes_config_args_to_tool(db_pool, admin_conn):
    """data_sources.config fields matching the args_schema flow into tool.arun."""
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(
            admin_conn, client_id, "segment",
            config='{"user_ids": ["u_1", "u_2"], "not_a_field": true}',
        )

        seg = _mock_tool("fetch_segment_events", "journey", [])
        seg.args_schema.model_fields = {"client_id": None, "user_ids": None, "since_hours": None}
        with patch("app.services.ingestion_service.TOOL_REGISTRY", {"segment": seg}):
            await run_ingestion(client_id)

        seg.arun.assert_called_once()
        tool_input = seg.arun.call_args.args[0]
        assert tool_input["user_ids"] == ["u_1", "u_2"]
        assert "not_a_field" not in tool_input
        assert tool_input["client_id"] == client_id
    finally:
        await _cleanup(admin_conn, client_id)


async def test_ingestion_tenant_isolation(db_pool, admin_conn):
    """Client B's ingestion must never touch Client A's sources or rows (§6)."""
    from app.services.ingestion_service import run_ingestion

    suffix = str(uuid.uuid4())[:8]
    client_a = await _seed_client(admin_conn, f"A{suffix}")
    client_b = await _seed_client(admin_conn, f"B{suffix}")
    try:
        await _seed_source(admin_conn, client_a, "zendesk")

        registry = {"zendesk": _mock_tool("fetch_zendesk_feedback", "voc", _VOC_RECORDS)}
        with patch("app.services.ingestion_service.TOOL_REGISTRY", registry):
            result_b = await run_ingestion(client_b)

        assert result_b["ingestion_count"] == 0
        assert result_b["sources_processed"] == []
        n_b = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM raw_feedback WHERE client_id = $1", client_b)
        assert n_b == 0
    finally:
        await _cleanup(admin_conn, client_a, client_b)
