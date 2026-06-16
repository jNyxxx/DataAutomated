"""
Tests for the two new real-data endpoints added in the realtime cleanup pass:

  GET /api/dashboard/summary  — extended with agent_runs_24h + recent_agent_runs
  GET /insights/feedback-samples — tenant-scoped raw feedback samples

Both use acquire_for_client (RLS + explicit client_id) per §6.

DB-dependent: skip when the database is unavailable (same pattern as test_endpoints.py).
"""

from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone, timedelta

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext

from app.config import settings
from app.database import close_pool, init_pool
from app.main import app

TEST_DB_DSN = settings.database_dsn
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Fixtures (all function-scoped to match existing test_endpoints.py pattern)
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping.")
    yield
    await close_pool()


@pytest.fixture
async def seeded_client(db_pool):
    """
    Insert a fresh client + analyst user, return (client_id, token).
    Cascade-delete the client on teardown (removes all child rows via FK).
    """
    suffix = str(_uuid.uuid4())[:8]
    email_client = f"ds_co_{suffix}@unit.com"
    email_user = f"ds_user_{suffix}@unit.com"
    password = "ds_pass"

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"DashSamples Co {suffix}", email_client,
        )
        hashed = _pwd.hash(password)
        await conn.execute(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'analyst');",
            client_id, email_user, hashed,
        )
    finally:
        await conn.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/auth/token",
            data={"username": email_user, "password": password},
        )
    assert resp.status_code == 200, f"Login failed: {resp.json()}"
    token = resp.json()["access_token"]

    yield client_id, token

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute("DELETE FROM clients WHERE id = $1;", client_id)
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# /api/dashboard/summary — agent_runs_24h + recent_agent_runs
# ---------------------------------------------------------------------------

async def test_dashboard_summary_includes_agent_run_fields(seeded_client):
    """Summary always returns agent_runs_24h and recent_agent_runs (empty is fine)."""
    _, token = seeded_client
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/api/dashboard/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "agent_runs_24h" in body
    assert "recent_agent_runs" in body
    assert isinstance(body["agent_runs_24h"], int)
    assert isinstance(body["recent_agent_runs"], list)


async def test_dashboard_summary_counts_agent_store_rows_within_24h(seeded_client):
    """
    Seed two agent.store rows for this client — one within 24h, one older.
    Verify agent_runs_24h == 1 (only the recent one) and recent_agent_runs
    contains exactly that row's actor/resource.
    """
    client_id, token = seeded_client
    now = datetime.now(timezone.utc)

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        # Recent row (within window)
        await conn.execute(
            "INSERT INTO audit_log (client_id, actor, action, resource, created_at) "
            "VALUES ($1, 'voc_agent', 'agent.store', 'feedback_insights', $2);",
            client_id, now - timedelta(hours=1),
        )
        # Old row (outside 24h window — must NOT be counted)
        await conn.execute(
            "INSERT INTO audit_log (client_id, actor, action, resource, created_at) "
            "VALUES ($1, 'comp_signal_agent', 'agent.store', 'competitive_signals', $2);",
            client_id, now - timedelta(hours=25),
        )
    finally:
        await conn.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/api/dashboard/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_runs_24h"] == 1
    actors = [r["actor"] for r in body["recent_agent_runs"]]
    assert "voc_agent" in actors
    # The old comp_signal_agent row may still appear in recent_agent_runs (no time
    # filter there — it's an unbounded LIMIT 10), but it must NOT inflate the 24h count.


async def test_dashboard_summary_only_counts_own_client_runs(seeded_client, db_pool):
    """
    Seed an agent.store row for a DIFFERENT client. The authenticated client
    must not see it in agent_runs_24h or recent_agent_runs (tenant isolation §6).
    """
    client_id, token = seeded_client
    now = datetime.now(timezone.utc)

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        other_client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            "Other Tenant Co", f"other__{_uuid.uuid4()}@unit.com",
        )
        await conn.execute(
            "INSERT INTO audit_log (client_id, actor, action, resource, created_at) "
            "VALUES ($1, 'voc_agent', 'agent.store', 'feedback_insights', $2);",
            other_client_id, now - timedelta(minutes=5),
        )
    finally:
        await conn.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/api/dashboard/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    # Our client has no agent.store rows → count must be 0
    assert body["agent_runs_24h"] == 0
    # recent_agent_runs must not contain the other client's row
    for run in body["recent_agent_runs"]:
        assert run.get("actor") != "voc_agent" or run.get("resource") != "feedback_insights"

    # Cleanup other client
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute("DELETE FROM clients WHERE id = $1;", other_client_id)
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# GET /insights/feedback-samples
# ---------------------------------------------------------------------------

async def test_feedback_samples_requires_auth(db_pool):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/insights/feedback-samples")
    assert resp.status_code == 401


async def test_feedback_samples_returns_empty_when_no_data(seeded_client):
    """No feedback seeded → samples list is empty (not an error)."""
    _, token = seeded_client
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/insights/feedback-samples",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "samples" in body
    assert body["samples"] == []


async def test_feedback_samples_returns_own_rows(seeded_client):
    """
    Seed a raw_feedback row for this client. Verify it appears in the samples
    response with the expected fields.
    """
    client_id, token = seeded_client

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        # Need a data_source row because raw_feedback.source_id references it
        # (no cascade, per §5 conventions — just needs to exist).
        source_id = await conn.fetchval(
            "INSERT INTO data_sources (client_id, source_type, credentials, config) "
            "VALUES ($1, 'zendesk', $2::jsonb, $3::jsonb) RETURNING id;",
            client_id, '{}', '{}',
        )
        await conn.execute(
            "INSERT INTO raw_feedback "
            "(client_id, source_id, source_type, content, ingested_at) "
            "VALUES ($1, $2, 'zendesk', 'Test feedback content', NOW());",
            client_id, source_id,
        )
    finally:
        await conn.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/insights/feedback-samples",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["samples"]) == 1
    s = body["samples"][0]
    assert s["source_type"] == "zendesk"
    assert s["content"] == "Test feedback content"
    assert "id" in s
    assert "ingested_at" in s


async def test_feedback_samples_tenant_isolation(seeded_client, db_pool):
    """
    Seed raw_feedback for a DIFFERENT client. The authenticated client must not
    see it — verifies RLS + explicit WHERE tenant-isolation (§6).
    """
    client_id, token = seeded_client

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        other_client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            "Isolation Test Co", f"iso__{_uuid.uuid4()}@unit.com",
        )
        other_source_id = await conn.fetchval(
            "INSERT INTO data_sources (client_id, source_type, credentials, config) "
            "VALUES ($1, 'typeform', $2::jsonb, $3::jsonb) RETURNING id;",
            other_client_id, '{}', '{}',
        )
        await conn.execute(
            "INSERT INTO raw_feedback "
            "(client_id, source_id, source_type, content, ingested_at) "
            "VALUES ($1, $2, 'typeform', 'Other tenant feedback', NOW());",
            other_client_id, other_source_id,
        )
    finally:
        await conn.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/insights/feedback-samples",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    contents = [s["content"] for s in resp.json()["samples"]]
    assert "Other tenant feedback" not in contents

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute("DELETE FROM clients WHERE id = $1;", other_client_id)
    finally:
        await conn.close()
