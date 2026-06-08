"""
Phase 4c — Behavioral Journey agent tests (CLAUDE.md §16; AGENT_ARCHITECTURE §3.3).

Structure mirrors test_voc_agent.py:
  1. Pure unit tests  — no DB, no LLM (funnel ordering, drop-off math, empty no-ops)
  2. LLM-mock tests   — no DB; friction diagnosis defaulting on malformed output
  3. E2E DB tests     — real DB, LLM mocked (store persist, RLS isolation, full graph run,
                        empty-events no-op)

All LLM calls are mocked — the suite passes with no live OPENAI_API_KEY.
DB-dependent tests skip automatically if the database is unreachable.
"""

from __future__ import annotations

import json
import os
import uuid as _uuid
from datetime import datetime, timedelta, timezone
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
        pytest.skip(f"Database not available ({exc}); skipping Journey DB tests.")
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
        f"Journey Test {suffix}",
        f"journey_{suffix}@test.com",
    )


async def _seed_funnel_events(conn: asyncpg.Connection, client_id) -> None:
    """
    Seed a known funnel: 3 sessions reach 'page_view', 1 continues to 'signup'.
    Funnel order (first-seen): page_view (step 1) -> signup (step 2).
    Drop-off page_view->signup = (3-1)/3 = 0.667 (material).
    """
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events = [
        ("s1", "page_view", base + timedelta(seconds=0)),
        ("s2", "page_view", base + timedelta(seconds=1)),
        ("s3", "page_view", base + timedelta(seconds=2)),
        ("s1", "signup", base + timedelta(seconds=100)),
    ]
    for sid, et, ts in events:
        await conn.execute(
            "INSERT INTO journey_events (client_id, session_id, event_type, occurred_at) "
            "VALUES ($1, $2, $3, $4)",
            client_id, sid, et, ts,
        )


async def _cleanup(conn: asyncpg.Connection, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM journey_insights WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM journey_events WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM users WHERE client_id = $1", cid)
    for cid in client_ids:
        await conn.execute("DELETE FROM clients WHERE id = $1", cid)


def _mock_llm(*contents: str) -> MagicMock:
    mock = MagicMock()
    responses = []
    for c in contents:
        r = MagicMock()
        r.content = c
        responses.append(r)
    mock.ainvoke = AsyncMock(side_effect=responses)
    return mock


def _base_state(**overrides):
    state = {
        "client_id": _uuid.uuid4(),
        "journey_events": [],
        "funnel_steps": [],
        "drop_off_analysis": [],
        "friction_diagnosis": [],
        "recommendations": [],
        "narrative": "",
    }
    state.update(overrides)
    return state


# ---------------------------------------------------------------------------
# 1. Pure unit tests — no DB, no LLM
# ---------------------------------------------------------------------------

def test_define_funnels_orders_by_first_occurrence():
    from app.agents.journey_agent import define_funnels_node

    # events already ordered oldest-first (as fetch_events_node returns them)
    events = [
        {"session_id": "s1", "event_type": "page_view"},
        {"session_id": "s2", "event_type": "page_view"},
        {"session_id": "s1", "event_type": "signup"},
        {"session_id": "s1", "event_type": "purchase"},
    ]
    result = define_funnels_node(_base_state(journey_events=events))
    steps = result["funnel_steps"]
    assert [s["event_type"] for s in steps] == ["page_view", "signup", "purchase"]
    assert steps[0]["count"] == 2   # two distinct sessions had page_view
    assert steps[1]["count"] == 1


def test_calculate_dropoffs_correct_rate():
    from app.agents.journey_agent import calculate_dropoffs_node

    events = [
        {"session_id": "s1", "event_type": "page_view"},
        {"session_id": "s2", "event_type": "page_view"},
        {"session_id": "s3", "event_type": "page_view"},
        {"session_id": "s1", "event_type": "signup"},
    ]
    state = _base_state(
        journey_events=events,
        funnel_steps=[
            {"step": 1, "event_type": "page_view", "count": 3},
            {"step": 2, "event_type": "signup", "count": 1},
        ],
    )
    result = calculate_dropoffs_node(state)
    analysis = result["drop_off_analysis"]
    assert len(analysis) == 1
    assert analysis[0]["entries"] == 3
    assert analysis[0]["exits"] == 2
    # node rounds drop_off_rate to 4 decimals (0.6667)
    assert analysis[0]["drop_off_rate"] == round(2 / 3, 4)


def test_define_funnels_empty_is_noop():
    from app.agents.journey_agent import define_funnels_node
    assert define_funnels_node(_base_state(journey_events=[]))["funnel_steps"] == []


def test_calculate_dropoffs_single_step_is_noop():
    from app.agents.journey_agent import calculate_dropoffs_node
    state = _base_state(funnel_steps=[{"step": 1, "event_type": "page_view", "count": 5}])
    assert calculate_dropoffs_node(state)["drop_off_analysis"] == []


async def test_store_node_noop_for_empty():
    from app.agents.journey_agent import store_node
    # No DB needed — returns before acquiring a connection.
    assert await store_node(_base_state(recommendations=[])) == {}


async def test_diagnose_skips_immaterial_dropoff():
    """Steps with drop_off_rate <= 0.1 are not diagnosed (cost control)."""
    from app.agents.journey_agent import diagnose_friction_node

    state = _base_state(drop_off_analysis=[
        {"funnel_step": "a -> b", "drop_off_rate": 0.05, "entries": 100, "exits": 5},
    ])
    result = await diagnose_friction_node(state, _mock_llm())
    assert result["friction_diagnosis"] == []


# ---------------------------------------------------------------------------
# 2. LLM-mock tests — no DB
# ---------------------------------------------------------------------------

async def test_diagnose_valid_output():
    from app.agents.journey_agent import diagnose_friction_node

    state = _base_state(drop_off_analysis=[
        {"funnel_step": "page_view -> signup", "drop_off_rate": 0.6, "entries": 10, "exits": 6},
    ])
    llm = _mock_llm(json.dumps([{"friction_cause": "messaging", "friction_score": 0.7}]))
    result = await diagnose_friction_node(state, llm)
    d = result["friction_diagnosis"][0]
    assert d["friction_cause"] == "messaging"
    assert d["friction_score"] == 0.7


async def test_diagnose_defaults_on_malformed():
    """Malformed LLM output → CHECK-valid default friction_cause, score from drop-off rate."""
    from app.agents.journey_agent import diagnose_friction_node

    state = _base_state(drop_off_analysis=[
        {"funnel_step": "page_view -> signup", "drop_off_rate": 0.6, "entries": 10, "exits": 6},
    ])
    llm = _mock_llm("garbage not json")
    result = await diagnose_friction_node(state, llm)
    d = result["friction_diagnosis"][0]
    assert d["friction_cause"] in ("ux_friction", "messaging", "expectation")
    assert d["friction_cause"] == "ux_friction"  # the safe default
    assert d["friction_score"] == 0.6


async def test_recommendations_fallback_on_malformed():
    from app.agents.journey_agent import generate_recommendations_node

    state = _base_state(friction_diagnosis=[
        {"funnel_step": "page_view -> signup", "drop_off_rate": 0.6,
         "friction_cause": "ux_friction", "friction_score": 0.6},
    ])
    llm = _mock_llm("not json")
    result = await generate_recommendations_node(state, llm)
    recs = result["recommendations"]
    assert len(recs) == 1
    assert recs[0]["recommendation"]                       # non-empty fallback text
    assert 0.0 <= recs[0]["projected_lift"] <= 1.0
    assert result["narrative"]


async def test_recommendations_empty_diagnosis():
    from app.agents.journey_agent import generate_recommendations_node
    result = await generate_recommendations_node(_base_state(friction_diagnosis=[]), _mock_llm())
    assert result["recommendations"] == []
    assert "No material" in result["narrative"]


# ---------------------------------------------------------------------------
# Fail-safe: missing API key (hermetic — no DB, no LLM)
# ---------------------------------------------------------------------------

async def test_run_skips_without_api_key(monkeypatch):
    """With no OPENAI_API_KEY the agent must return cleanly without constructing ChatOpenAI."""
    import app.agents.journey_agent as _j

    monkeypatch.setattr(settings, "openai_api_key", "")
    mock_cls = MagicMock()
    monkeypatch.setattr(_j, "ChatOpenAI", mock_cls)

    result = await _j.run_journey_analysis(_uuid.uuid4())
    assert result is None
    mock_cls.assert_not_called()


# ---------------------------------------------------------------------------
# 3. E2E DB tests — real DB, LLM mocked
# ---------------------------------------------------------------------------

async def test_store_node_persists_and_isolates(db_pool, admin_conn):
    from app.agents.journey_agent import store_node

    suffix = str(_uuid.uuid4())[:8]
    a_id = await _seed_client(admin_conn, f"A{suffix}")
    b_id = await _seed_client(admin_conn, f"B{suffix}")
    try:
        state = _base_state(client_id=a_id, recommendations=[
            {"funnel_step": "page_view -> signup", "drop_off_rate": 0.6,
             "friction_cause": "ux_friction", "friction_score": 0.6,
             "recommendation": "Simplify the signup form.", "projected_lift": 0.12},
            {"funnel_step": "signup -> purchase", "drop_off_rate": 0.4,
             "friction_cause": "expectation", "friction_score": 0.4,
             "recommendation": "Clarify pricing earlier.", "projected_lift": 0.08},
        ])
        await store_node(state)

        a_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM journey_insights WHERE client_id = $1", a_id
        )
        assert a_count == 2
        causes = await admin_conn.fetch(
            "SELECT friction_cause FROM journey_insights WHERE client_id = $1", a_id
        )
        assert {r["friction_cause"] for r in causes} == {"ux_friction", "expectation"}

        b_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM journey_insights WHERE client_id = $1", b_id
        )
        assert b_count == 0
    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_run_full_pipeline_persists(db_pool, admin_conn, monkeypatch):
    from app.agents.journey_agent import run_journey_analysis
    import app.agents.journey_agent as _j

    suffix = str(_uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_funnel_events(admin_conn, client_id)
        monkeypatch.setattr(settings, "openai_api_key", "test-key")

        # One material step (page_view -> signup) → diagnose call, then recommend call.
        diagnose_json = json.dumps([{"friction_cause": "ux_friction", "friction_score": 0.65}])
        recommend_json = json.dumps({
            "recommendations": [{"recommendation": "Shorten the signup form", "projected_lift": 0.15}],
            "narrative": "Signup is the main leak point.",
        })
        monkeypatch.setattr(_j, "ChatOpenAI", MagicMock(return_value=_mock_llm(diagnose_json, recommend_json)))

        await run_journey_analysis(client_id)

        rows = await admin_conn.fetch(
            "SELECT funnel_step, drop_off_rate, friction_cause, recommendation, projected_lift "
            "FROM journey_insights WHERE client_id = $1",
            client_id,
        )
        assert len(rows) == 1
        assert rows[0]["funnel_step"] == "page_view -> signup"
        assert rows[0]["friction_cause"] == "ux_friction"
        assert rows[0]["recommendation"] == "Shorten the signup form"
        assert abs(rows[0]["projected_lift"] - 0.15) < 1e-6
        assert rows[0]["drop_off_rate"] > 0.1
    finally:
        await _cleanup(admin_conn, client_id)


async def test_run_empty_events_is_noop(db_pool, admin_conn, monkeypatch):
    from app.agents.journey_agent import run_journey_analysis
    import app.agents.journey_agent as _j

    suffix = str(_uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key")
        monkeypatch.setattr(_j, "ChatOpenAI", MagicMock(return_value=_mock_llm()))

        await run_journey_analysis(client_id)

        count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM journey_insights WHERE client_id = $1", client_id
        )
        assert count == 0
    finally:
        await _cleanup(admin_conn, client_id)
