"""
Phase 4b — Competitive Signal agent tests (CLAUDE.md §16; AGENT_ARCHITECTURE §3.2).

Structure mirrors test_voc_agent.py:
  1. Pure unit tests  — no DB, no LLM (flag_critical, skip-empty, store no-op)
  2. LLM-mock tests   — no DB; classify defaulting on malformed output
  3. E2E DB tests     — real DB, LLM mocked (fetch_competitors, store persist, RLS isolation,
                        full graph no-op, full pipeline via mine_signals monkeypatch)

All LLM calls are mocked — the suite passes with no live OPENAI_API_KEY.
DB-dependent tests skip automatically if the database is unreachable.
"""

from __future__ import annotations

import json
import os
import uuid as _uuid
from unittest.mock import AsyncMock, MagicMock

import asyncpg
import pytest

from app.config import settings
from app.database import close_pool, init_pool

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping CompSig DB tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}).")
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_client(conn: asyncpg.Connection, suffix: str):
    return await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"CompSig Test {suffix}",
        f"compsig_{suffix}@test.com",
    )


async def _seed_competitor_source(conn: asyncpg.Connection, client_id, competitors: list[str]):
    await conn.execute(
        "INSERT INTO data_sources (client_id, source_type, config, is_active) "
        "VALUES ($1, 'competitor_monitor', $2::jsonb, TRUE)",
        client_id,
        json.dumps({"competitors": competitors}),
    )


async def _cleanup(conn: asyncpg.Connection, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM competitive_signals WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM data_sources WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM users WHERE client_id = $1", cid)
    for cid in client_ids:
        await conn.execute("DELETE FROM clients WHERE id = $1", cid)


def _mock_llm(*contents: str) -> MagicMock:
    """A mock LLM whose ainvoke returns the given contents in sequence (one per call)."""
    mock = MagicMock()
    responses = []
    for c in contents:
        r = MagicMock()
        r.content = c
        responses.append(r)
    mock.ainvoke = AsyncMock(side_effect=responses)
    return mock


# ---------------------------------------------------------------------------
# 1. Pure unit tests — no DB, no LLM
# ---------------------------------------------------------------------------

def _base_state(**overrides):
    state = {
        "client_id": _uuid.uuid4(),
        "competitors": [],
        "raw_signals": [],
        "classified_signals": [],
        "strategic_context": [],
        "critical_signals": [],
    }
    state.update(overrides)
    return state


def test_flag_critical_filters_correctly():
    from app.agents.comp_signal_agent import flag_critical_node

    state = _base_state(strategic_context=[
        {"competitor_name": "A", "urgency": "critical"},
        {"competitor_name": "B", "urgency": "high"},
        {"competitor_name": "C", "urgency": "critical"},
        {"competitor_name": "D", "urgency": "low"},
    ])
    result = flag_critical_node(state)
    assert len(result["critical_signals"]) == 2
    assert all(s["urgency"] == "critical" for s in result["critical_signals"])


async def test_classify_skips_empty():
    from app.agents.comp_signal_agent import classify_signals_node

    result = await classify_signals_node(_base_state(raw_signals=[]), _mock_llm())
    assert result["classified_signals"] == []


async def test_context_skips_empty():
    from app.agents.comp_signal_agent import generate_strategic_context_node

    result = await generate_strategic_context_node(_base_state(classified_signals=[]), _mock_llm())
    assert result["strategic_context"] == []


async def test_store_node_noop_for_empty():
    from app.agents.comp_signal_agent import store_node

    # No DB needed — store returns early before acquiring a connection.
    result = await store_node(_base_state(strategic_context=[]))
    assert result == {}


# ---------------------------------------------------------------------------
# 2. LLM-mock tests — no DB
# ---------------------------------------------------------------------------

async def test_classify_valid_output():
    from app.agents.comp_signal_agent import classify_signals_node

    raw = [
        {"competitor_name": "Acme", "raw_content": "Acme cut prices 20%"},
        {"competitor_name": "Globex", "raw_content": "Globex hired a new CFO"},
    ]
    llm = _mock_llm(json.dumps([
        {"signal_type": "pricing_change", "urgency": "critical"},
        {"signal_type": "hiring_spike", "urgency": "low"},
    ]))
    result = await classify_signals_node(_base_state(raw_signals=raw), llm)
    cs = result["classified_signals"]
    assert len(cs) == 2
    assert cs[0]["signal_type"] == "pricing_change"
    assert cs[0]["urgency"] == "critical"
    assert cs[1]["signal_type"] == "hiring_spike"


async def test_classify_defaults_on_malformed():
    """Malformed LLM output must not crash and must keep 1:1 alignment with safe defaults."""
    from app.agents.comp_signal_agent import classify_signals_node

    raw = [{"competitor_name": "Acme", "raw_content": "something"}]
    llm = _mock_llm("this is not json at all")
    result = await classify_signals_node(_base_state(raw_signals=raw), llm)
    cs = result["classified_signals"]
    assert len(cs) == 1
    assert cs[0]["signal_type"] == "other"
    assert cs[0]["urgency"] == "low"


async def test_classify_invalid_urgency_defaults_safe():
    """An out-of-domain urgency from the LLM must be coerced to a CHECK-valid value."""
    from app.agents.comp_signal_agent import classify_signals_node

    raw = [{"competitor_name": "Acme", "raw_content": "x"}]
    llm = _mock_llm(json.dumps([{"signal_type": "pricing", "urgency": "EXTREME"}]))
    result = await classify_signals_node(_base_state(raw_signals=raw), llm)
    # "EXTREME" fails the Literal → whole item defaults to other/low
    assert result["classified_signals"][0]["urgency"] in ("critical", "high", "medium", "low")


async def test_context_fallback_on_malformed():
    from app.agents.comp_signal_agent import generate_strategic_context_node

    classified = [{"competitor_name": "Acme", "signal_type": "pricing", "urgency": "high", "raw_content": "x"}]
    llm = _mock_llm("not json")
    result = await generate_strategic_context_node(_base_state(classified_signals=classified), llm)
    ctx = result["strategic_context"][0]["strategic_context"]
    assert "Acme" in ctx and "pricing" in ctx  # deterministic fallback used


# ---------------------------------------------------------------------------
# Fail-safe: missing API key (hermetic — no DB, no LLM)
# ---------------------------------------------------------------------------

async def test_run_skips_without_api_key(monkeypatch):
    """With no OPENAI_API_KEY the agent must return cleanly without constructing ChatOpenAI."""
    import app.agents.comp_signal_agent as _cs

    monkeypatch.setattr(settings, "openai_api_key", "")
    mock_cls = MagicMock()
    monkeypatch.setattr(_cs, "ChatOpenAI", mock_cls)

    result = await _cs.run_comp_signal_analysis(_uuid.uuid4())
    assert result is None
    mock_cls.assert_not_called()


# ---------------------------------------------------------------------------
# 3. E2E DB tests — real DB, LLM mocked
# ---------------------------------------------------------------------------

async def test_fetch_competitors_parses_config(db_pool, admin_conn):
    from app.agents.comp_signal_agent import fetch_competitors_node

    suffix = str(_uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_competitor_source(admin_conn, client_id, ["Acme", "Globex"])
        result = await fetch_competitors_node({"client_id": client_id, "competitors": []})
        names = {c["name"] for c in result["competitors"]}
        assert names == {"Acme", "Globex"}
    finally:
        await _cleanup(admin_conn, client_id)


async def test_store_node_persists_and_isolates(db_pool, admin_conn):
    from app.agents.comp_signal_agent import store_node

    suffix = str(_uuid.uuid4())[:8]
    a_id = await _seed_client(admin_conn, f"A{suffix}")
    b_id = await _seed_client(admin_conn, f"B{suffix}")
    try:
        state = _base_state(client_id=a_id, strategic_context=[
            {"competitor_name": "Acme", "signal_type": "pricing", "signal_source": "g2",
             "raw_content": "cut prices", "strategic_context": "Match pricing.", "urgency": "critical"},
            {"competitor_name": "Globex", "signal_type": "hiring", "signal_source": "linkedin",
             "raw_content": "hired CFO", "strategic_context": "Watch finance moves.", "urgency": "low"},
        ])
        await store_node(state)

        a_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals WHERE client_id = $1", a_id
        )
        assert a_count == 2
        # urgency values are CHECK-valid (insert would have failed otherwise)
        urgencies = await admin_conn.fetch(
            "SELECT urgency FROM competitive_signals WHERE client_id = $1", a_id
        )
        assert {r["urgency"] for r in urgencies} == {"critical", "low"}

        # Isolation: client B got nothing
        b_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals WHERE client_id = $1", b_id
        )
        assert b_count == 0
    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_run_no_competitors_is_noop(db_pool, admin_conn, monkeypatch):
    """Full graph with no competitors → mine returns [] → nothing persisted, no error."""
    from app.agents.comp_signal_agent import run_comp_signal_analysis
    import app.agents.comp_signal_agent as _cs

    suffix = str(_uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key")
        # ChatOpenAI should never actually be called (mine returns [] → classify skips),
        # but patch it so no real client is constructed.
        monkeypatch.setattr(_cs, "ChatOpenAI", MagicMock(return_value=_mock_llm()))

        await run_comp_signal_analysis(client_id)

        count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals WHERE client_id = $1", client_id
        )
        assert count == 0
    finally:
        await _cleanup(admin_conn, client_id)


async def test_run_full_pipeline_persists(db_pool, admin_conn, monkeypatch):
    """
    Exercise the whole graph end-to-end by monkeypatching mine_signals to return mock
    raw signals (simulating P5 tools), then verify classify→context→store persistence.
    """
    from app.agents.comp_signal_agent import run_comp_signal_analysis
    import app.agents.comp_signal_agent as _cs

    suffix = str(_uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key")

        async def _fake_mine(state):
            return {"raw_signals": [
                {"competitor_name": "Acme", "signal_source": "https://g2.com/acme",
                 "raw_content": "Acme launched a cheaper tier"},
                {"competitor_name": "Globex", "signal_source": "news",
                 "raw_content": "Globex announced layoffs"},
            ]}

        monkeypatch.setattr(_cs, "mine_signals_node", _fake_mine)

        # classify call, then context call
        classify_json = json.dumps([
            {"signal_type": "pricing", "urgency": "critical"},
            {"signal_type": "news", "urgency": "medium"},
        ])
        context_json = json.dumps([
            "Acme's cheaper tier threatens the low end; consider a starter plan.",
            "Globex layoffs may signal instability; emphasize reliability in messaging.",
        ])
        monkeypatch.setattr(_cs, "ChatOpenAI", MagicMock(return_value=_mock_llm(classify_json, context_json)))

        await run_comp_signal_analysis(client_id)

        rows = await admin_conn.fetch(
            "SELECT competitor_name, signal_type, urgency, strategic_context "
            "FROM competitive_signals WHERE client_id = $1 ORDER BY competitor_name",
            client_id,
        )
        assert len(rows) == 2
        assert rows[0]["competitor_name"] == "Acme"
        assert rows[0]["signal_type"] == "pricing"
        assert rows[0]["urgency"] == "critical"
        assert "starter" in rows[0]["strategic_context"]
        assert rows[1]["competitor_name"] == "Globex"
        assert rows[1]["urgency"] == "medium"
    finally:
        await _cleanup(admin_conn, client_id)
