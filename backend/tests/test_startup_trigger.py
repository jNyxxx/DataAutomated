"""
Tests for backend/app/services/startup_service.py.

trigger_all_active_clients() must:
  - Call _run_client once per active client found in the pool
  - Swallow all exceptions (startup must never fail due to agent errors)
  - Be a no-op when the pool is None
  - Be a no-op when there are no active clients

No database or HTTP server is needed — all external calls are mocked.
"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_row(client_id: uuid.UUID, name: str = "Test Client"):
    """asyncpg Record-like object: supports row["field"] access."""
    row = MagicMock()
    row.__getitem__ = lambda self, key: client_id if key == "id" else name
    return row


# ---------------------------------------------------------------------------
# trigger_all_active_clients — pool is None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_no_op_when_pool_is_none():
    """If the pool has not initialised, trigger_all_active_clients returns silently."""
    import app.database as _db
    original_pool = _db.pool

    try:
        _db.pool = None
        # Should not raise; no tasks created
        from app.services.startup_service import trigger_all_active_clients
        await trigger_all_active_clients()
    finally:
        _db.pool = original_pool


# ---------------------------------------------------------------------------
# trigger_all_active_clients — no active clients
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_no_op_when_no_active_clients():
    """If the clients query returns an empty list, no tasks are spawned."""
    import app.database as _db

    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=[])

    original_pool = _db.pool
    try:
        _db.pool = mock_pool
        from app.services.startup_service import trigger_all_active_clients
        await trigger_all_active_clients()
        mock_pool.fetch.assert_awaited_once()
    finally:
        _db.pool = original_pool


# ---------------------------------------------------------------------------
# trigger_all_active_clients — one active client → task created
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_creates_task_per_active_client():
    """
    With two active clients, trigger_all_active_clients creates two tasks,
    one per client. We intercept asyncio.create_task to capture the calls.
    """
    import app.database as _db

    client_a = uuid.uuid4()
    client_b = uuid.uuid4()
    rows = [_make_row(client_a, "Client A"), _make_row(client_b, "Client B")]

    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(return_value=rows)

    created_tasks: list = []

    original_pool = _db.pool
    try:
        _db.pool = mock_pool

        async def _noop_run(client_id, client_name):
            pass

        original_create_task = asyncio.create_task

        def _capturing_create_task(coro, **kwargs):
            created_tasks.append(kwargs.get("name", "unnamed"))
            # Schedule it for real so the event loop is happy
            return original_create_task(coro, **kwargs)

        with patch("app.services.startup_service.asyncio.create_task", side_effect=_capturing_create_task):
            with patch("app.services.startup_service._run_client", new=_noop_run):
                from importlib import reload
                import app.services.startup_service as svc
                await svc.trigger_all_active_clients()
                # Allow tasks to run
                await asyncio.sleep(0)

        assert len(created_tasks) == 2
        assert any(str(client_a) in t for t in created_tasks)
        assert any(str(client_b) in t for t in created_tasks)
    finally:
        _db.pool = original_pool


# ---------------------------------------------------------------------------
# trigger_all_active_clients — pool.fetch raises
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_swallows_pool_fetch_exception():
    """If pool.fetch raises, trigger_all_active_clients catches it and returns."""
    import app.database as _db

    mock_pool = AsyncMock()
    mock_pool.fetch = AsyncMock(side_effect=RuntimeError("DB connection refused"))

    original_pool = _db.pool
    try:
        _db.pool = mock_pool
        from app.services.startup_service import trigger_all_active_clients
        # Must not raise
        await trigger_all_active_clients()
    finally:
        _db.pool = original_pool


# ---------------------------------------------------------------------------
# _run_client — agent exceptions are swallowed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_client_swallows_agent_exceptions():
    """
    If one of the three agents raises, _run_client logs it but does not propagate,
    so the other agents still run (asyncio.gather return_exceptions=True).
    """
    client_id = uuid.uuid4()

    # ingestion succeeds
    mock_ingestion = AsyncMock(return_value={"ingested": 0})
    # VoC raises, others succeed
    mock_voc = AsyncMock(side_effect=ValueError("LLM timeout"))
    mock_comp = AsyncMock(return_value=None)
    mock_journey = AsyncMock(return_value=None)

    with (
        patch("app.services.startup_service.asyncio", asyncio),
        patch("app.services.ingestion_service.run_ingestion", mock_ingestion, create=True),
    ):
        from app.services import startup_service as svc

        with (
            patch.object(svc, "_run_client", wraps=svc._run_client),
        ):
            with (
                patch("app.routers.insights._run_voc_analysis", mock_voc, create=True),
                patch("app.routers.signals._run_comp_signal_analysis", mock_comp, create=True),
                patch("app.routers.journeys._run_journey_analysis", mock_journey, create=True),
            ):
                # Must not raise even though VoC threw
                await svc._run_client(client_id, "Test Client")

    mock_comp.assert_awaited_once_with(client_id)
    mock_journey.assert_awaited_once_with(client_id)


# ---------------------------------------------------------------------------
# _run_client — ingestion failure does not skip agents
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_client_continues_after_ingestion_failure():
    """
    If run_ingestion raises, _run_client logs and continues to the agent step.
    Agents must still be invoked.
    """
    client_id = uuid.uuid4()

    mock_voc = AsyncMock(return_value=None)
    mock_comp = AsyncMock(return_value=None)
    mock_journey = AsyncMock(return_value=None)

    from app.services import startup_service as svc

    with (
        patch("app.routers.insights._run_voc_analysis", mock_voc, create=True),
        patch("app.routers.signals._run_comp_signal_analysis", mock_comp, create=True),
        patch("app.routers.journeys._run_journey_analysis", mock_journey, create=True),
    ):
        # Simulate ingestion_service raising
        with patch("app.services.ingestion_service.run_ingestion",
                   AsyncMock(side_effect=ConnectionError("source unreachable")),
                   create=True):
            await svc._run_client(client_id, "Test Client")

    # Agents must still have been called despite ingestion failure
    mock_voc.assert_awaited_once_with(client_id)
    mock_comp.assert_awaited_once_with(client_id)
    mock_journey.assert_awaited_once_with(client_id)
