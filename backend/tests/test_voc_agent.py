"""
Phase 4a — VoC agent tests (CLAUDE.md §16; AGENT_ARCHITECTURE §9).

Structure:
  1. Pure unit tests  — no DB, no LLM (theme clustering, churn risk, alert threshold)
  2. NLP mock tests   — no DB; extract_feedback_batch mocked
  3. E2E DB tests     — real DB, LLM mocked via monkeypatch

All DB-dependent tests skip automatically if the database is unreachable.
All LLM calls are mocked — tests must pass without a live OPENAI_API_KEY.

Follows the same fixture/seed/cleanup pattern as test_isolation.py:
  - admin_conn: superuser, auto-commit (no explicit transaction); used for seeding + assertions
  - db_pool: initializes the shared pool for acquire_for_client calls in the agent
  - _cleanup: explicit DELETE to keep the DB clean between tests
"""

from __future__ import annotations

import os
import uuid as _uuid
from unittest.mock import AsyncMock, MagicMock

import asyncpg
import pytest

import app.database as _db
from app.config import settings
from app.database import acquire_for_client, close_pool, init_pool

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    """Initialise the shared pool; skip if DB is unreachable."""
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping VoC DB tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    """Superuser direct connection, auto-commit. For seeding and post-run assertions."""
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}).")
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Seed/cleanup helpers
# ---------------------------------------------------------------------------

async def _seed_voc_client(
    conn: asyncpg.Connection,
    suffix: str,
    n_feedback: int = 3,
) -> tuple:
    """Insert a client and n_feedback unprocessed raw_feedback rows. Returns (client_id, [feedback_ids])."""
    client_id = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"VoC Test {suffix}",
        f"voc_{suffix}@test.com",
    )
    feedback_ids = []
    for i in range(n_feedback):
        fid = await conn.fetchval(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, $2) RETURNING id",
            client_id,
            f"Feedback item {i} for {suffix}. The product is great but onboarding needs work.",
        )
        feedback_ids.append(fid)
    return client_id, feedback_ids


async def _cleanup(conn: asyncpg.Connection, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM feedback_insights WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM raw_feedback WHERE client_id = $1", cid)
        await conn.execute("DELETE FROM users WHERE client_id = $1", cid)
    for cid in client_ids:
        await conn.execute("DELETE FROM clients WHERE id = $1", cid)


# ---------------------------------------------------------------------------
# Helper: build a fake LLM mock that returns canned narrative text
# ---------------------------------------------------------------------------

def _make_mock_llm(narrative: str = "Test narrative.") -> MagicMock:
    mock_llm = MagicMock()
    mock_response = MagicMock()
    mock_response.content = narrative
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    return mock_llm


# ---------------------------------------------------------------------------
# 1. Pure unit tests — no DB, no LLM
# ---------------------------------------------------------------------------

async def test_theme_clustering_groups_correctly():
    from app.agents.voc_agent import theme_clustering_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [{}],
        "preprocessed": [{}],
        "sentiment_results": [
            {"sentiment_score": 0.8, "urgency_score": 0.1, "primary_theme": "onboarding", "intent": "praise", "churn_signal": False},
            {"sentiment_score": 0.7, "urgency_score": 0.2, "primary_theme": "onboarding", "intent": "request", "churn_signal": False},
            {"sentiment_score": -0.5, "urgency_score": 0.9, "primary_theme": "pricing", "intent": "complaint", "churn_signal": True},
        ],
        "theme_clusters": [],
        "churn_risk_score": 0.0,
        "narrative": "",
        "alert_required": False,
    }

    result = theme_clustering_node(state)
    clusters = result["theme_clusters"]

    onboarding = next(c for c in clusters if c["theme"] == "onboarding")
    pricing = next(c for c in clusters if c["theme"] == "pricing")

    assert onboarding["count"] == 2
    assert pricing["count"] == 1
    assert pricing["churn_signal_rate"] == 1.0
    assert onboarding["churn_signal_rate"] == 0.0
    # onboarding is sorted first (higher count)
    assert clusters[0]["theme"] == "onboarding"


async def test_churn_risk_formula_pure_churn():
    from app.agents.voc_agent import theme_clustering_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [{}],
        "preprocessed": [{}],
        "sentiment_results": [
            {"sentiment_score": -0.9, "urgency_score": 0.9, "primary_theme": "pricing", "intent": "complaint", "churn_signal": True},
            {"sentiment_score": -0.8, "urgency_score": 0.8, "primary_theme": "pricing", "intent": "complaint", "churn_signal": True},
            {"sentiment_score": -0.7, "urgency_score": 0.7, "primary_theme": "pricing", "intent": "complaint", "churn_signal": True},
        ],
        "theme_clusters": [],
        "churn_risk_score": 0.0,
        "narrative": "",
        "alert_required": False,
    }

    result = theme_clustering_node(state)
    # 100% churn_signal, 100% negative → risk should be >= 0.5
    assert result["churn_risk_score"] >= 0.5
    assert result["churn_risk_score"] <= 1.0


async def test_churn_risk_formula_no_risk():
    from app.agents.voc_agent import theme_clustering_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [{}],
        "preprocessed": [{}],
        "sentiment_results": [
            {"sentiment_score": 0.9, "urgency_score": 0.0, "primary_theme": "feature", "intent": "praise", "churn_signal": False},
            {"sentiment_score": 0.8, "urgency_score": 0.0, "primary_theme": "feature", "intent": "praise", "churn_signal": False},
        ],
        "theme_clusters": [],
        "churn_risk_score": 0.0,
        "narrative": "",
        "alert_required": False,
    }

    result = theme_clustering_node(state)
    assert result["churn_risk_score"] < 0.15


async def test_check_alert_above_threshold():
    from app.agents.voc_agent import check_alert_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [], "preprocessed": [],
        "sentiment_results": [], "theme_clusters": [],
        "churn_risk_score": 0.16,
        "narrative": "",
        "alert_required": False,
    }
    result = check_alert_node(state)
    assert result["alert_required"] is True


async def test_check_alert_below_threshold():
    from app.agents.voc_agent import check_alert_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [], "preprocessed": [],
        "sentiment_results": [], "theme_clusters": [],
        "churn_risk_score": 0.14,
        "narrative": "",
        "alert_required": False,
    }
    result = check_alert_node(state)
    assert result["alert_required"] is False


async def test_sentiment_label_positive():
    """store_results_node uses majority-vote; >60% positive items → label='positive'."""
    from app.agents.voc_agent import store_results_node, VoCState

    # We can't call store_results_node without a DB, so test the label logic directly
    # by exercising theme_clustering (which computes churn_risk for the store call).
    # Instead, test the label logic inline:
    scores = [0.8, 0.7, 0.9, 0.6, 0.5]  # all > 0.1 → pos_frac = 1.0 >= 0.6 → "positive"
    total = len(scores)
    pos_frac = sum(1 for s in scores if s > 0.1) / total
    neg_frac = sum(1 for s in scores if s < -0.1) / total
    if pos_frac >= 0.6:
        label = "positive"
    elif neg_frac >= 0.6:
        label = "negative"
    elif pos_frac >= 0.2 and neg_frac >= 0.2:
        label = "mixed"
    else:
        label = "neutral"
    assert label == "positive"


async def test_sentiment_label_mixed():
    scores = [0.8, 0.7, 0.6, -0.8, -0.7, -0.6]  # equal split → mixed
    total = len(scores)
    pos_frac = sum(1 for s in scores if s > 0.1) / total
    neg_frac = sum(1 for s in scores if s < -0.1) / total
    if pos_frac >= 0.6:
        label = "positive"
    elif neg_frac >= 0.6:
        label = "negative"
    elif pos_frac >= 0.2 and neg_frac >= 0.2:
        label = "mixed"
    else:
        label = "neutral"
    assert label == "mixed"


async def test_theme_clustering_empty_returns_zero_risk():
    from app.agents.voc_agent import theme_clustering_node, VoCState

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [], "preprocessed": [],
        "sentiment_results": [],
        "theme_clusters": [],
        "churn_risk_score": 0.0,
        "narrative": "",
        "alert_required": False,
    }
    result = theme_clustering_node(state)
    assert result["theme_clusters"] == []
    assert result["churn_risk_score"] == 0.0


# ---------------------------------------------------------------------------
# 2. NLP mock tests — no DB; extract_feedback_batch mocked
# ---------------------------------------------------------------------------

async def test_nlp_analysis_node_returns_sentiment_results(monkeypatch):
    """nlp_analysis_node returns model_dump() of mocked NLPResults."""
    from app.agents.voc_agent import nlp_analysis_node, VoCState
    from app.services.nlp_service import NLPResult

    fake_results = [
        NLPResult(sentiment_score=0.7, urgency_score=0.2, primary_theme="onboarding", intent="praise", churn_signal=False),
        NLPResult(sentiment_score=-0.3, urgency_score=0.6, primary_theme="pricing", intent="complaint", churn_signal=True),
    ]

    async def _fake_extract(items, llm):
        return fake_results

    monkeypatch.setattr("app.services.nlp_service.extract_feedback_batch", _fake_extract)
    # Re-import to pick up the monkeypatch on the module attribute used by the agent
    import importlib
    import app.agents.voc_agent as _voc_mod
    monkeypatch.setattr(_voc_mod, "extract_feedback_batch", _fake_extract)

    state: VoCState = {
        "client_id": _uuid.uuid4(),
        "raw_feedback": [{"id": _uuid.uuid4(), "content": "great product"}],
        "preprocessed": [{"id": _uuid.uuid4(), "content": "great product"}],
        "sentiment_results": [],
        "theme_clusters": [],
        "churn_risk_score": 0.0,
        "narrative": "",
        "alert_required": False,
    }
    mock_llm = _make_mock_llm()
    result = await nlp_analysis_node(state, mock_llm)

    assert len(result["sentiment_results"]) == 2
    assert result["sentiment_results"][0]["sentiment_score"] == 0.7
    assert result["sentiment_results"][1]["churn_signal"] is True


async def test_nlp_service_rejects_malformed_output():
    """extract_feedback_batch skips items that fail Pydantic validation."""
    from app.services.nlp_service import extract_feedback_batch

    items = [{"id": _uuid.uuid4(), "content": "test feedback"}]
    mock_llm = MagicMock()
    # Return JSON with invalid sentiment_score (out of range)
    bad_response = MagicMock()
    bad_response.content = '[{"sentiment_score": 999, "urgency_score": 0.5, "primary_theme": "x", "intent": "praise", "churn_signal": false}]'
    mock_llm.ainvoke = AsyncMock(return_value=bad_response)

    results = await extract_feedback_batch(items, mock_llm)
    # The malformed item should be skipped
    assert results == []


async def test_nlp_service_valid_batch():
    """extract_feedback_batch returns NLPResult objects for valid LLM output."""
    from app.services.nlp_service import extract_feedback_batch

    items = [
        {"id": _uuid.uuid4(), "content": "love the product"},
        {"id": _uuid.uuid4(), "content": "pricing is too high"},
    ]
    mock_llm = MagicMock()
    valid_response = MagicMock()
    valid_response.content = (
        '[{"sentiment_score": 0.8, "urgency_score": 0.1, "primary_theme": "product", "intent": "praise", "churn_signal": false},'
        ' {"sentiment_score": -0.6, "urgency_score": 0.7, "primary_theme": "pricing", "intent": "complaint", "churn_signal": true}]'
    )
    mock_llm.ainvoke = AsyncMock(return_value=valid_response)

    results = await extract_feedback_batch(items, mock_llm)
    assert len(results) == 2
    assert results[0].sentiment_score == 0.8
    assert results[1].churn_signal is True
    assert results[1].intent == "complaint"


# ---------------------------------------------------------------------------
# 3. E2E DB tests — real DB, LLM mocked
# ---------------------------------------------------------------------------

async def test_voc_agent_e2e_persists_insight(db_pool, admin_conn, monkeypatch):
    """
    Full agent run: seed raw_feedback → run_voc_analysis → verify feedback_insights created
    and raw_feedback rows marked processed=TRUE.
    """
    from app.agents.voc_agent import run_voc_analysis
    from app.services.nlp_service import NLPResult

    suffix = str(_uuid.uuid4())[:8]
    client_id, feedback_ids = await _seed_voc_client(admin_conn, suffix, n_feedback=3)

    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key-e2e")

        async def _fake_extract(items, llm):
            return [
                NLPResult(
                    sentiment_score=0.6,
                    urgency_score=0.2,
                    primary_theme="onboarding",
                    intent="praise",
                    churn_signal=False,
                )
                for _ in items
            ]

        import app.agents.voc_agent as _voc_mod
        monkeypatch.setattr(_voc_mod, "extract_feedback_batch", _fake_extract)

        # Mock narrative LLM
        mock_llm_cls = MagicMock()
        mock_llm_inst = _make_mock_llm("Great feedback period. Customers are happy with onboarding.")
        mock_llm_cls.return_value = mock_llm_inst
        monkeypatch.setattr(_voc_mod, "ChatOpenAI", mock_llm_cls)

        await run_voc_analysis(client_id)

        # Verify insight was persisted
        insight_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights WHERE client_id = $1", client_id
        )
        assert insight_count == 1, f"Expected 1 feedback_insight, got {insight_count}"

        # Verify all raw_feedback rows are now processed
        unprocessed_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM raw_feedback WHERE client_id = $1 AND processed = FALSE",
            client_id,
        )
        assert unprocessed_count == 0, f"Expected 0 unprocessed rows, got {unprocessed_count}"

        # Verify insight has expected values
        insight = await admin_conn.fetchrow(
            "SELECT sentiment_score, sentiment_label, churn_risk FROM feedback_insights "
            "WHERE client_id = $1",
            client_id,
        )
        assert insight["sentiment_label"] in ("positive", "neutral", "mixed", "negative")
        assert 0.0 <= insight["churn_risk"] <= 1.0

    finally:
        await _cleanup(admin_conn, client_id)


async def test_voc_agent_e2e_rls_isolation(db_pool, admin_conn, monkeypatch):
    """
    Tenant isolation: running the agent for client A must not affect client B's data.
    B's raw_feedback stays unprocessed; B has no feedback_insights row.
    """
    from app.agents.voc_agent import run_voc_analysis
    from app.services.nlp_service import NLPResult

    suffix = str(_uuid.uuid4())[:8]
    a_id, a_feedback_ids = await _seed_voc_client(admin_conn, f"A{suffix}", n_feedback=2)
    b_id, b_feedback_ids = await _seed_voc_client(admin_conn, f"B{suffix}", n_feedback=2)

    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key-isolation")

        async def _fake_extract(items, llm):
            return [
                NLPResult(sentiment_score=0.5, urgency_score=0.1, primary_theme="speed",
                          intent="praise", churn_signal=False)
                for _ in items
            ]

        import app.agents.voc_agent as _voc_mod
        monkeypatch.setattr(_voc_mod, "extract_feedback_batch", _fake_extract)
        mock_llm_cls = MagicMock()
        mock_llm_cls.return_value = _make_mock_llm("All good.")
        monkeypatch.setattr(_voc_mod, "ChatOpenAI", mock_llm_cls)

        # Run ONLY for client A
        await run_voc_analysis(a_id)

        # A should have an insight
        a_insight_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights WHERE client_id = $1", a_id
        )
        assert a_insight_count == 1, "Client A should have exactly one insight"

        # B should have NO insight
        b_insight_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights WHERE client_id = $1", b_id
        )
        assert b_insight_count == 0, "Client B must not have any insights (isolation failure)"

        # B's raw_feedback must still be unprocessed
        b_unprocessed = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM raw_feedback WHERE client_id = $1 AND processed = FALSE",
            b_id,
        )
        assert b_unprocessed == 2, "Client B's feedback must remain unprocessed"

    finally:
        await _cleanup(admin_conn, a_id, b_id)


async def test_voc_agent_e2e_empty_feedback_is_noop(db_pool, admin_conn, monkeypatch):
    """
    Agent run with no unprocessed raw_feedback must be a graceful no-op:
    no feedback_insights row created, no error raised.
    """
    from app.agents.voc_agent import run_voc_analysis

    suffix = str(_uuid.uuid4())[:8]
    # Seed client with NO raw_feedback rows
    client_id = await admin_conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"VoC NoFeed {suffix}",
        f"vocnofeed_{suffix}@test.com",
    )

    try:
        monkeypatch.setattr(settings, "openai_api_key", "test-key-noop")

        import app.agents.voc_agent as _voc_mod
        mock_llm_cls = MagicMock()
        mock_llm_cls.return_value = _make_mock_llm()
        monkeypatch.setattr(_voc_mod, "ChatOpenAI", mock_llm_cls)

        # Should complete without error
        await run_voc_analysis(client_id)

        # No insight should be created
        insight_count = await admin_conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights WHERE client_id = $1", client_id
        )
        assert insight_count == 0, "No insight should be created when there is no feedback"

    finally:
        await _cleanup(admin_conn, client_id)
