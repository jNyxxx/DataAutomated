"""
Phase 5 — MCP tool layer tests (CLAUDE.md §16; MCP_ARCHITECTURE.md).

Structure:
  1. async_retry_with_backoff unit tests — no DB, no network
  2. Graceful-degrade stub tests         — no DB, no network
  3. Tool normalization tests            — mocked credentials + mocked httpx
  4. Security: credentials not in output — mocked credentials + mocked httpx
  5. Registry DB tests                   — real DB (skip if unreachable)
  6. mine_signals_node unit tests        — mocked registry + mocked tools

All DB-dependent tests skip automatically if the database is unreachable.
All network calls are mocked — the suite passes with no live API keys.
asyncio_mode = auto (pytest.ini) — no @pytest.mark.asyncio needed.
"""

from __future__ import annotations

import json
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import settings

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


# ---------------------------------------------------------------------------
# DB fixtures (same pattern as test_comp_signal_agent.py)
# ---------------------------------------------------------------------------

try:
    import asyncpg as _asyncpg_mod
    _asyncpg_available = True
except ImportError:
    _asyncpg_available = False


from app.database import close_pool, init_pool


@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping MCP DB tests.")
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


# ---------------------------------------------------------------------------
# Seeding helpers
# ---------------------------------------------------------------------------

async def _seed_client(conn, suffix: str):
    return await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"MCP Test {suffix}",
        f"mcp_{suffix}@test.com",
    )


async def _seed_source(conn, client_id, source_type: str, is_active: bool = True):
    await conn.execute(
        "INSERT INTO data_sources (client_id, source_type, is_active) VALUES ($1, $2, $3)",
        client_id, source_type, is_active,
    )


async def _cleanup(conn, *client_ids) -> None:
    for cid in client_ids:
        await conn.execute("DELETE FROM data_sources WHERE client_id = $1", cid)
    for cid in client_ids:
        await conn.execute("DELETE FROM clients WHERE id = $1", cid)


# ---------------------------------------------------------------------------
# Helpers for mocking httpx
# ---------------------------------------------------------------------------

def _mock_response(status_code: int, json_data: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    if status_code >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            str(status_code),
            request=httpx.Request("GET", "https://example.com"),
            response=httpx.Response(status_code),
        )
    else:
        resp.raise_for_status = MagicMock()
    return resp


def _mock_httpx_client(response: MagicMock) -> AsyncMock:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.get = AsyncMock(return_value=response)
    return client


# ---------------------------------------------------------------------------
# 1. async_retry_with_backoff unit tests
# ---------------------------------------------------------------------------

async def test_backoff_retries_on_429():
    from app.tools.base_tool import async_retry_with_backoff

    call_count = 0

    async def mock_coro(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 429 if call_count < 3 else 200
        return resp

    with patch("asyncio.sleep"):
        result = await async_retry_with_backoff(mock_coro)

    assert result.status_code == 200
    assert call_count == 3


async def test_backoff_no_retry_on_401():
    from app.tools.base_tool import async_retry_with_backoff

    call_count = 0

    async def mock_coro(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 401
        return resp

    result = await async_retry_with_backoff(mock_coro)
    assert result.status_code == 401
    assert call_count == 1


async def test_backoff_no_retry_on_404():
    from app.tools.base_tool import async_retry_with_backoff

    call_count = 0

    async def mock_coro(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.status_code = 404
        return resp

    result = await async_retry_with_backoff(mock_coro)
    assert result.status_code == 404
    assert call_count == 1


async def test_backoff_raises_on_exhausted_retries():
    from app.tools.base_tool import async_retry_with_backoff

    resp = _mock_response(503, {})

    async def mock_coro(*args, **kwargs):
        return resp

    with patch("asyncio.sleep"):
        with pytest.raises(httpx.HTTPStatusError):
            await async_retry_with_backoff(mock_coro)


async def test_backoff_retries_on_timeout():
    from app.tools.base_tool import async_retry_with_backoff

    call_count = 0

    async def mock_coro(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise httpx.TimeoutException("timed out")
        resp = MagicMock()
        resp.status_code = 200
        return resp

    with patch("asyncio.sleep"):
        result = await async_retry_with_backoff(mock_coro)

    assert result.status_code == 200
    assert call_count == 3


async def test_backoff_raises_timeout_on_exhausted():
    from app.tools.base_tool import async_retry_with_backoff

    async def mock_coro(*args, **kwargs):
        raise httpx.TimeoutException("always times out")

    with patch("asyncio.sleep"):
        with pytest.raises(httpx.TimeoutException):
            await async_retry_with_backoff(mock_coro)


# ---------------------------------------------------------------------------
# 2. Graceful-degrade stub tests
# ---------------------------------------------------------------------------

async def test_graceful_degrade_g2_returns_empty():
    from app.tools.scraper_tool import G2ReviewScraper

    tool = G2ReviewScraper()
    result = await tool._arun(client_id=uuid.uuid4(), competitors=["Acme"])
    assert result == []


async def test_graceful_degrade_capterra_returns_empty():
    from app.tools.scraper_tool import CapterraReviewScraper

    tool = CapterraReviewScraper()
    result = await tool._arun(client_id=uuid.uuid4(), competitors=["Acme"])
    assert result == []


async def test_graceful_degrade_linkedin_returns_empty():
    from app.tools.scraper_tool import LinkedInJobsScraper

    tool = LinkedInJobsScraper()
    result = await tool._arun(client_id=uuid.uuid4(), competitors=["Acme"])
    assert result == []


# ---------------------------------------------------------------------------
# 3. Normalization tests (mocked credentials + mocked httpx)
# ---------------------------------------------------------------------------

_FAKE_ZENDESK_CREDS = {"subdomain": "example", "email": "admin@example.com", "api_token": "tok_abc"}
_FAKE_TYPEFORM_CREDS = {"access_token": "tf_tok_xyz"}
_FAKE_NEWS_CREDS = {"api_key": "news_key_123"}


async def test_zendesk_normalizes_response():
    from app.tools.zendesk_tool import ZendeskFeedbackTool

    tool = ZendeskFeedbackTool()
    fake_payload = {
        "tickets": [
            {"id": 42, "description": "Login fails with 500 error", "subject": "Login broken",
             "status": "open", "created_at": "2026-06-01T00:00:00Z"},
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(ZendeskFeedbackTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_ZENDESK_CREDS)):
        with patch("app.tools.zendesk_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert len(result) == 1
    assert result[0]["id"] == "42"
    assert result[0]["content"] == "Login fails with 500 error"
    assert result[0]["metadata"]["subject"] == "Login broken"
    assert result[0]["metadata"]["source_type"] == "zendesk"


async def test_zendesk_returns_empty_on_api_error():
    from app.tools.zendesk_tool import ZendeskFeedbackTool

    tool = ZendeskFeedbackTool()
    mock_client = _mock_httpx_client(_mock_response(401, {}))

    with patch.object(ZendeskFeedbackTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_ZENDESK_CREDS)):
        with patch("app.tools.zendesk_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert result == []


async def test_typeform_normalizes_response():
    from app.tools.typeform_tool import TypeformResponseTool

    tool = TypeformResponseTool()
    fake_payload = {
        "items": [
            {
                "response_id": "resp_001",
                "submitted_at": "2026-06-01T12:00:00Z",
                "answers": [
                    {"type": "text", "text": "Really love the product"},
                    {"type": "choice", "choice": {"label": "Very satisfied"}},
                ],
            }
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(TypeformResponseTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_TYPEFORM_CREDS)):
        with patch("app.tools.typeform_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), form_id="form123", since_hours=24)

    assert len(result) == 1
    assert result[0]["id"] == "resp_001"
    assert "Really love the product" in result[0]["content"]
    assert "Very satisfied" in result[0]["content"]
    assert result[0]["metadata"]["form_id"] == "form123"
    assert result[0]["metadata"]["source_type"] == "typeform"


async def test_typeform_flatten_answers():
    from app.tools.typeform_tool import _flatten_answers

    answers = [
        {"type": "text", "text": "Great experience"},
        {"type": "choice", "choice": {"label": "Satisfied"}},
        {"type": "number", "number": 9},
        {"type": "boolean", "boolean": True},
    ]
    flat = _flatten_answers(answers)
    assert "Great experience" in flat
    assert "Satisfied" in flat
    assert "9" in flat
    assert "True" in flat


async def test_news_normalizes_response():
    from app.tools.scraper_tool import NewsSignalTool

    tool = NewsSignalTool()
    fake_payload = {
        "articles": [
            {
                "title": "Acme raises Series B",
                "description": "Acme Corp announced $50M round",
                "url": "https://techcrunch.com/acme",
                "publishedAt": "2026-06-01T09:00:00Z",
                "source": {"name": "TechCrunch"},
            }
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(NewsSignalTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_NEWS_CREDS)):
        with patch("app.tools.scraper_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(
                client_id=uuid.uuid4(), competitors=["Acme"], since_hours=48
            )

    assert len(result) == 1
    assert result[0]["id"] == "https://techcrunch.com/acme"
    assert "Acme raises Series B" in result[0]["content"]
    assert result[0]["metadata"]["competitor_name"] == "Acme"
    assert result[0]["metadata"]["signal_source"] == "https://techcrunch.com/acme"
    assert result[0]["metadata"]["source_type"] == "news"


async def test_news_skips_empty_competitors():
    from app.tools.scraper_tool import NewsSignalTool

    tool = NewsSignalTool()
    with patch.object(NewsSignalTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_NEWS_CREDS)):
        result = await tool._arun(client_id=uuid.uuid4(), competitors=[], since_hours=48)

    assert result == []


async def test_news_arun_dict_seam():
    """
    Exercise the LangChain arun(dict) → args_schema validation → _arun(**kwargs) path.

    This is the seam production uses — mine_signals_node calls tool.arun(dict) not
    tool._arun(**kwargs).  Verifies that UUID in the dict, the 'competitors' list, and
    'run_manager' injection all work correctly end-to-end.
    """
    from app.tools.scraper_tool import NewsSignalTool

    tool = NewsSignalTool()
    fake_payload = {
        "articles": [
            {"title": "Acme big news", "description": "Acme Corp grows",
             "url": "https://news.com/acme", "publishedAt": "2026-06-01T00:00:00Z",
             "source": {"name": "TechCrunch"}},
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(NewsSignalTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_NEWS_CREDS)):
        with patch("app.tools.scraper_tool.httpx.AsyncClient", return_value=mock_client):
            # Invoke exactly the way mine_signals_node does in production
            client_id = uuid.uuid4()
            tool_input = {"client_id": client_id, "competitors": ["Acme"]}
            result = await tool.arun(tool_input)

    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["metadata"]["competitor_name"] == "Acme"
    assert result[0]["metadata"]["source_type"] == "news"
    assert result[0]["content"] != ""


async def test_news_tolerates_per_competitor_failure():
    """One competitor fetch always timing out must not drop results from the other."""
    from app.tools.scraper_tool import NewsSignalTool

    tool = NewsSignalTool()
    fake_globex = {
        "articles": [
            {"title": "Globex news", "description": "about Globex",
             "url": "https://news.com/g", "publishedAt": "2026-06-01",
             "source": {"name": "News"}},
        ]
    }

    async def mock_get(url, *, params=None, **kwargs):
        if params and params.get("q") == "Acme":
            raise httpx.TimeoutException("Acme always times out")
        return _mock_response(200, fake_globex)

    # Single shared mock client; each _fetch_one receives the same instance since
    # httpx.AsyncClient is patched to always return it.
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = mock_get

    with patch.object(NewsSignalTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_NEWS_CREDS)):
        with patch("app.tools.scraper_tool.httpx.AsyncClient", return_value=mock_client):
            with patch("asyncio.sleep"):
                result = await tool._arun(
                    client_id=uuid.uuid4(),
                    competitors=["Acme", "Globex"],
                    since_hours=48,
                )

    competitor_names = {r["metadata"]["competitor_name"] for r in result}
    assert "Globex" in competitor_names
    assert "Acme" not in competitor_names


# ---------------------------------------------------------------------------
# 4. Security: credentials must not appear in tool output
# ---------------------------------------------------------------------------

async def test_credentials_not_in_output():
    from app.tools.zendesk_tool import ZendeskFeedbackTool

    tool = ZendeskFeedbackTool()
    sensitive_creds = {
        "subdomain": "secret_corp",
        "email": "super_secret_admin@corp.com",
        "api_token": "VERY_SECRET_TOKEN_12345",
    }
    fake_payload = {
        "tickets": [
            {"id": 1, "description": "Help needed", "subject": "Issue",
             "status": "open", "created_at": "2026-06-01T00:00:00Z"},
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(ZendeskFeedbackTool, "_load_credentials", new=AsyncMock(return_value=sensitive_creds)):
        with patch("app.tools.zendesk_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    output_str = json.dumps(result)
    for secret in ("VERY_SECRET_TOKEN_12345", "super_secret_admin@corp.com"):
        assert secret not in output_str, f"Credential '{secret}' leaked into tool output"


# ---------------------------------------------------------------------------
# 5. Registry DB tests (real DB; auto-skip if unreachable)
# ---------------------------------------------------------------------------

async def test_get_tools_returns_empty_when_no_sources(db_pool, admin_conn):
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        tools = await get_tools_for_client(client_id)
        assert tools == []
    finally:
        await _cleanup(admin_conn, client_id)


async def test_get_tools_returns_only_connected(db_pool, admin_conn):
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk")
        await _seed_source(admin_conn, client_id, "news")

        tools = await get_tools_for_client(client_id)
        names = {t.name for t in tools}
        assert names == {"fetch_zendesk_feedback", "search_news_signals"}
    finally:
        await _cleanup(admin_conn, client_id)


async def test_get_tools_category_filter(db_pool, admin_conn):
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk")  # voc
        await _seed_source(admin_conn, client_id, "news")     # compsig

        compsig_tools = await get_tools_for_client(client_id, category="compsig")
        assert len(compsig_tools) == 1
        assert compsig_tools[0].name == "search_news_signals"

        voc_tools = await get_tools_for_client(client_id, category="voc")
        assert len(voc_tools) == 1
        assert voc_tools[0].name == "fetch_zendesk_feedback"
    finally:
        await _cleanup(admin_conn, client_id)


async def test_get_tools_excludes_inactive(db_pool, admin_conn):
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "zendesk", is_active=True)
        await _seed_source(admin_conn, client_id, "news", is_active=False)

        tools = await get_tools_for_client(client_id)
        assert len(tools) == 1
        assert tools[0].name == "fetch_zendesk_feedback"
    finally:
        await _cleanup(admin_conn, client_id)


async def test_get_tools_tenant_isolation(db_pool, admin_conn):
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_a = await _seed_client(admin_conn, f"A{suffix}")
    client_b = await _seed_client(admin_conn, f"B{suffix}")
    try:
        await _seed_source(admin_conn, client_a, "zendesk")

        tools_b = await get_tools_for_client(client_b)
        assert tools_b == [], "Client B must not see Client A's tools"
    finally:
        await _cleanup(admin_conn, client_a, client_b)


async def test_get_tools_unknown_source_type_silently_excluded(db_pool, admin_conn):
    """A source_type not in TOOL_REGISTRY must be silently skipped (not raise)."""
    from app.tools.registry import get_tools_for_client

    suffix = str(uuid.uuid4())[:8]
    client_id = await _seed_client(admin_conn, suffix)
    try:
        await _seed_source(admin_conn, client_id, "unknown_vendor_xyz")  # no tool registered

        tools = await get_tools_for_client(client_id)
        assert tools == []
    finally:
        await _cleanup(admin_conn, client_id)


# ---------------------------------------------------------------------------
# 6. mine_signals_node unit tests (mocked registry + mocked tools)
# ---------------------------------------------------------------------------

def _base_state(**overrides):
    state = {
        "client_id": uuid.uuid4(),
        "competitors": [{"name": "Acme"}],
        "raw_signals": [],
        "classified_signals": [],
        "strategic_context": [],
        "critical_signals": [],
    }
    state.update(overrides)
    return state


async def test_mine_signals_empty_competitors_short_circuits(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    mock_registry = AsyncMock()
    monkeypatch.setattr(_cs, "get_tools_for_client", mock_registry)

    result = await mine_signals_node(_base_state(competitors=[]))

    assert result == {"raw_signals": []}
    mock_registry.assert_not_called()


async def test_mine_signals_no_tools_returns_empty(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    monkeypatch.setattr(_cs, "get_tools_for_client", AsyncMock(return_value=[]))

    result = await mine_signals_node(_base_state())
    assert result == {"raw_signals": []}


async def test_mine_signals_maps_normalized_output_to_raw_signals(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    mock_tool = MagicMock()
    mock_tool.name = "search_news_signals"
    mock_tool.arun = AsyncMock(return_value=[
        {
            "id": "https://news.com/1",
            "content": "Acme cut prices by 20%",
            "metadata": {
                "competitor_name": "Acme",
                "signal_source": "https://news.com/1",
                "source_type": "news",
            },
        }
    ])

    monkeypatch.setattr(_cs, "get_tools_for_client", AsyncMock(return_value=[mock_tool]))

    result = await mine_signals_node(_base_state())

    assert len(result["raw_signals"]) == 1
    sig = result["raw_signals"][0]
    assert sig["competitor_name"] == "Acme"
    assert sig["signal_source"] == "https://news.com/1"
    assert sig["raw_content"] == "Acme cut prices by 20%"


async def test_mine_signals_partial_failure_aggregates_remaining(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    failing_tool = MagicMock()
    failing_tool.name = "scrape_g2_reviews"
    failing_tool.arun = AsyncMock(side_effect=Exception("connection refused"))

    succeeding_tool = MagicMock()
    succeeding_tool.name = "search_news_signals"
    succeeding_tool.arun = AsyncMock(return_value=[
        {"id": "url1", "content": "Globex layoffs",
         "metadata": {"competitor_name": "Globex", "signal_source": "url1"}},
    ])

    monkeypatch.setattr(
        _cs, "get_tools_for_client",
        AsyncMock(return_value=[failing_tool, succeeding_tool]),
    )

    result = await mine_signals_node(_base_state())

    assert len(result["raw_signals"]) == 1
    assert result["raw_signals"][0]["competitor_name"] == "Globex"


async def test_mine_signals_unknown_competitor_name_defaults(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    mock_tool = MagicMock()
    mock_tool.name = "search_news_signals"
    mock_tool.arun = AsyncMock(return_value=[
        {"id": "url1", "content": "Some content", "metadata": {}},
    ])

    monkeypatch.setattr(_cs, "get_tools_for_client", AsyncMock(return_value=[mock_tool]))

    result = await mine_signals_node(_base_state())

    assert result["raw_signals"][0]["competitor_name"] == "unknown"


async def test_mine_signals_registry_failure_returns_empty(monkeypatch):
    from app.agents.comp_signal_agent import mine_signals_node
    import app.agents.comp_signal_agent as _cs

    monkeypatch.setattr(
        _cs, "get_tools_for_client",
        AsyncMock(side_effect=Exception("pool not initialized")),
    )

    result = await mine_signals_node(_base_state())
    assert result == {"raw_signals": []}


# ---------------------------------------------------------------------------
# 7. Phase 5b tools — intercom / mixpanel / segment / shopify
# ---------------------------------------------------------------------------

_FAKE_INTERCOM_CREDS = {"access_token": "ic_tok_123"}
_FAKE_MIXPANEL_CREDS = {"api_secret": "mp_secret_123"}
_FAKE_SEGMENT_CREDS = {"space_id": "spa_1", "access_token": "seg_tok_123"}
_FAKE_SHOPIFY_CREDS = {"shop_domain": "acme", "access_token": "shpat_123"}


async def test_intercom_normalizes_response():
    from app.tools.intercom_tool import IntercomConversationsTool

    tool = IntercomConversationsTool()
    fake_payload = {
        "conversations": [
            {
                "id": 9001,
                "state": "open",
                "created_at": 1750000000,
                "source": {"subject": "Billing question", "body": "<p>Why was I charged twice?</p>"},
            }
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))
    mock_client.post = AsyncMock(return_value=_mock_response(200, fake_payload))

    with patch.object(IntercomConversationsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_INTERCOM_CREDS)):
        with patch("app.tools.intercom_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert len(result) == 1
    assert result[0]["id"] == "9001"
    assert result[0]["content"] == "Why was I charged twice?"
    assert "<p>" not in result[0]["content"]
    assert result[0]["metadata"]["subject"] == "Billing question"
    assert result[0]["metadata"]["source_type"] == "intercom"


async def test_intercom_returns_empty_on_api_error():
    from app.tools.intercom_tool import IntercomConversationsTool

    tool = IntercomConversationsTool()
    mock_client = _mock_httpx_client(_mock_response(401, {}))
    mock_client.post = AsyncMock(return_value=_mock_response(401, {}))

    with patch.object(IntercomConversationsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_INTERCOM_CREDS)):
        with patch("app.tools.intercom_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert result == []


async def test_mixpanel_normalizes_ndjson_export():
    from app.tools.journey_tool import MixpanelEventsTool

    tool = MixpanelEventsTool()
    ndjson = "\n".join([
        json.dumps({"event": "page_view", "properties": {
            "time": 1750000000, "distinct_id": "user_1", "$insert_id": "ins_1",
            "$current_url": "https://app.example.com/signup"}}),
        json.dumps({"event": "form_start", "properties": {
            "time": 1750000060, "distinct_id": "user_1", "$insert_id": "ins_2"}}),
        "not-json-garbage",
    ])
    resp = _mock_response(200, {})
    resp.text = ndjson
    mock_client = _mock_httpx_client(resp)

    with patch.object(MixpanelEventsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_MIXPANEL_CREDS)):
        with patch("app.tools.journey_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert len(result) == 2
    assert result[0]["id"] == "ins_1"
    assert result[0]["content"] == "page_view"
    assert result[0]["metadata"]["event_type"] == "page_view"
    assert result[0]["metadata"]["user_id"] == "user_1"
    assert result[0]["metadata"]["occurred_at"] is not None
    assert result[0]["metadata"]["source_type"] == "mixpanel"
    assert result[0]["metadata"]["properties"]["$current_url"] == "https://app.example.com/signup"


async def test_mixpanel_returns_empty_on_api_error():
    from app.tools.journey_tool import MixpanelEventsTool

    tool = MixpanelEventsTool()
    mock_client = _mock_httpx_client(_mock_response(401, {}))

    with patch.object(MixpanelEventsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_MIXPANEL_CREDS)):
        with patch("app.tools.journey_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert result == []


async def test_segment_degrades_without_user_ids():
    """Segment has no global event-export endpoint — no configured user_ids → []."""
    from app.tools.journey_tool import SegmentEventsTool

    tool = SegmentEventsTool()
    result = await tool._arun(client_id=uuid.uuid4(), user_ids=[])
    assert result == []


async def test_segment_normalizes_profile_events():
    from app.tools.journey_tool import SegmentEventsTool

    tool = SegmentEventsTool()
    fake_payload = {
        "data": [
            {
                "type": "track", "event": "checkout_started",
                "timestamp": "2099-06-01T10:00:00Z", "message_id": "msg_1",
                "context": {"sessionId": "sess_9"},
                "properties": {"cart_value": 99.0},
            }
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(SegmentEventsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_SEGMENT_CREDS)):
        with patch("app.tools.journey_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), user_ids=["u_1"], since_hours=24)

    assert len(result) == 1
    assert result[0]["id"] == "msg_1"
    assert result[0]["metadata"]["event_type"] == "checkout_started"
    assert result[0]["metadata"]["session_id"] == "sess_9"
    assert result[0]["metadata"]["user_id"] == "u_1"
    assert result[0]["metadata"]["properties"]["cart_value"] == 99.0
    assert result[0]["metadata"]["source_type"] == "segment"


async def test_shopify_normalizes_events():
    from app.tools.journey_tool import ShopifyEventsTool

    tool = ShopifyEventsTool()
    fake_payload = {
        "events": [
            {
                "id": 555, "subject_type": "Order", "verb": "create",
                "created_at": "2026-06-01T10:00:00-04:00", "author": "shopify",
                "message": "Order #1001 was created", "subject_id": 1001,
            }
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))

    with patch.object(ShopifyEventsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_SHOPIFY_CREDS)):
        with patch("app.tools.journey_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert len(result) == 1
    assert result[0]["id"] == "555"
    assert result[0]["metadata"]["event_type"] == "order_create"
    assert result[0]["metadata"]["session_id"] == "1001"
    assert result[0]["metadata"]["occurred_at"] == "2026-06-01T10:00:00-04:00"
    assert result[0]["metadata"]["source_type"] == "shopify"


async def test_shopify_returns_empty_on_api_error():
    from app.tools.journey_tool import ShopifyEventsTool

    tool = ShopifyEventsTool()
    mock_client = _mock_httpx_client(_mock_response(403, {}))

    with patch.object(ShopifyEventsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_SHOPIFY_CREDS)):
        with patch("app.tools.journey_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4(), since_hours=24)

    assert result == []


async def test_new_tools_credentials_not_in_output():
    """SR-04: no credential material may appear anywhere in normalized output."""
    from app.tools.intercom_tool import IntercomConversationsTool

    tool = IntercomConversationsTool()
    fake_payload = {
        "conversations": [
            {"id": 1, "state": "open", "created_at": 1, "source": {"subject": "s", "body": "hello"}}
        ]
    }
    mock_client = _mock_httpx_client(_mock_response(200, fake_payload))
    mock_client.post = AsyncMock(return_value=_mock_response(200, fake_payload))

    with patch.object(IntercomConversationsTool, "_load_credentials", new=AsyncMock(return_value=_FAKE_INTERCOM_CREDS)):
        with patch("app.tools.intercom_tool.httpx.AsyncClient", return_value=mock_client):
            result = await tool._arun(client_id=uuid.uuid4())

    assert _FAKE_INTERCOM_CREDS["access_token"] not in json.dumps(result)


async def test_registry_contains_all_mvp_source_types():
    """CLAUDE.md §8 — every MVP source type has a registered tool."""
    from app.tools.registry import TOOL_REGISTRY

    expected = {
        "zendesk", "typeform", "intercom",
        "news", "g2", "capterra", "linkedin_jobs",
        "mixpanel", "segment", "shopify",
    }
    assert expected.issubset(set(TOOL_REGISTRY.keys()))
    assert all(t.category in ("voc", "compsig", "journey") for t in TOOL_REGISTRY.values())
