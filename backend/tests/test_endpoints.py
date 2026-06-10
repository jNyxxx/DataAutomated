"""
Phase 3 — Endpoint smoke tests.

Covers: health check, auth guard, background dispatch timing, dashboard summary.
All fixtures are function-scoped (same pattern as P2 conftest.py — avoids asyncio
cross-loop errors with pytest-asyncio).

Requires: running DB + alembic upgrade head.  DB-dependent tests skip if unavailable.
"""

from __future__ import annotations

import os
import time
import uuid as _uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext

from app.config import settings
from app.database import close_pool, init_pool
from app.main import app

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Fixtures (all function-scoped)
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping endpoint tests.")
    yield
    await close_pool()


@pytest.fixture
async def bearer_token(db_pool):
    """
    Insert a test client+user, obtain a JWT, yield the token, clean up.
    Uses a unique suffix to avoid email collisions across test runs.
    """
    suffix = str(_uuid.uuid4())[:8]
    email_client = f"epco_{suffix}@unit.com"
    email_user = f"epuser_{suffix}@unit.com"
    password = "ep_password"

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"Endpoint Test Co {suffix}", email_client,
        )
        hashed = _pwd.hash(password)
        await conn.execute(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'viewer');",
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

    yield token

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute("DELETE FROM users WHERE email = $1;", email_user)
        await conn.execute("DELETE FROM clients WHERE email = $1;", email_client)
    finally:
        await conn.close()


@pytest.fixture
async def http_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Health — no DB required
# ---------------------------------------------------------------------------

async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Auth guard (no DB needed — pool=None still returns 401 before hitting DB)
# ---------------------------------------------------------------------------

async def test_insights_latest_requires_auth(http_client):
    resp = await http_client.get("/insights/latest")
    assert resp.status_code == 401


async def test_signals_latest_requires_auth(http_client):
    resp = await http_client.get("/signals/latest")
    assert resp.status_code == 401


async def test_journeys_latest_requires_auth(http_client):
    resp = await http_client.get("/journeys/latest")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Internal endpoint auth (N8N_WEBHOOK_SECRET)
# ---------------------------------------------------------------------------

async def test_active_clients_requires_internal_secret(http_client, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.get("/api/clients/active-list")
    assert resp.status_code == 401


async def test_active_clients_accepts_internal_secret(http_client, db_pool, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.get(
        "/api/clients/active-list",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    assert "clients" in resp.json()


async def test_churn_webhook_requires_internal_secret(http_client, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.post("/webhook/churn-alert", json={"client_id": "x"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Background dispatch timing (< 100ms)
# ---------------------------------------------------------------------------

async def test_analyze_returns_202_immediately(bearer_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        start = time.monotonic()
        resp = await ac.post(
            "/insights/analyze",
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
        elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 202
    assert resp.json()["status"] == "analysis_queued"
    assert elapsed_ms < 100, f"/insights/analyze took {elapsed_ms:.1f}ms — must be < 100ms"


async def test_signals_analyze_returns_202_immediately(bearer_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        start = time.monotonic()
        resp = await ac.post(
            "/signals/analyze",
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
        elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 202
    assert elapsed_ms < 100, f"/signals/analyze took {elapsed_ms:.1f}ms — must be < 100ms"


async def test_journeys_analyze_returns_202_immediately(bearer_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        start = time.monotonic()
        resp = await ac.post(
            "/journeys/analyze",
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
        elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 202
    assert elapsed_ms < 100, f"/journeys/analyze took {elapsed_ms:.1f}ms — must be < 100ms"


# ---------------------------------------------------------------------------
# /auth/me (P3 endpoint — returns the authenticated user's profile)
# ---------------------------------------------------------------------------

async def test_me_returns_profile(bearer_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/auth/me", headers={"Authorization": f"Bearer {bearer_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"id", "client_id", "role"}
    assert body["role"] == "viewer"


async def test_me_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/auth/me")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# n8n agent-run aliases — server-to-server auth (X-N8N-Webhook-Secret + explicit
# client_id per §13/§6; n8n loops over clients, so per-client JWTs cannot work)
# ---------------------------------------------------------------------------

@pytest.fixture
async def n8n_client_id(db_pool, monkeypatch):
    """Seed an active client and arm the webhook secret; yield the client id."""
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    suffix = str(_uuid.uuid4())[:8]
    email = f"n8nco_{suffix}@unit.com"
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"n8n Test Co {suffix}", email,
        )
    finally:
        await conn.close()

    yield str(client_id)

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute("DELETE FROM clients WHERE email = $1;", email)
    finally:
        await conn.close()


_N8N_HEADERS = {"X-N8N-Webhook-Secret": "test-internal-secret"}


async def test_n8n_voc_run_alias_returns_202(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/agents/voc/run",
            headers=_N8N_HEADERS,
            json={"client_id": n8n_client_id},
        )
    assert resp.status_code == 202
    assert resp.json()["status"] == "analysis_queued"


async def test_n8n_competitive_signal_run_alias_returns_202(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/agents/competitive-signal/run",
            headers=_N8N_HEADERS,
            json={"client_id": n8n_client_id},
        )
    assert resp.status_code == 202
    assert resp.json()["status"] == "analysis_queued"


async def test_n8n_voc_run_alias_requires_secret(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/agents/voc/run", json={"client_id": n8n_client_id})
    assert resp.status_code == 401


async def test_n8n_voc_run_alias_rejects_unknown_client(n8n_client_id):
    """A valid secret but an unknown client_id must 404, not run cross-tenant."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/agents/voc/run",
            headers=_N8N_HEADERS,
            json={"client_id": str(_uuid.uuid4())},
        )
    assert resp.status_code == 404


async def test_n8n_ingest_trigger_requires_secret(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/ingest/trigger", json={"client_id": n8n_client_id})
    assert resp.status_code == 401


async def test_n8n_latest_signals_for_client(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            f"/api/signals/latest-for-client?client_id={n8n_client_id}",
            headers=_N8N_HEADERS,
        )
    assert resp.status_code == 200
    assert resp.json() == {"signals": []}


async def test_reports_generate_accepts_jwt(bearer_token):
    """Dashboard path: JWT bearer still works on the dual-auth route."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/reports/generate",
            headers={"Authorization": f"Bearer {bearer_token}"},
            json={"report_type": "weekly_intelligence", "period": "last_7_days"},
        )
    assert resp.status_code == 202
    assert resp.json()["status"] == "report_queued"


async def test_reports_generate_accepts_n8n_secret(n8n_client_id):
    """n8n path: webhook secret + explicit client_id on the dual-auth route."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/reports/generate",
            headers=_N8N_HEADERS,
            json={"client_id": n8n_client_id, "report_type": "weekly_intelligence"},
        )
    assert resp.status_code == 202
    assert resp.json()["status"] == "report_queued"


async def test_reports_generate_rejects_anonymous(n8n_client_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/reports/generate", json={"client_id": n8n_client_id})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Dashboard summary (< 300ms)
# ---------------------------------------------------------------------------

async def test_dashboard_summary(bearer_token):
    """GET /api/dashboard/summary must return 200 in under 300ms."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        start = time.monotonic()
        resp = await ac.get(
            "/api/dashboard/summary",
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
        elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 200
    assert elapsed_ms < 300, f"/api/dashboard/summary took {elapsed_ms:.1f}ms — must be < 300ms"
    body = resp.json()
    assert "sentiment_score" in body
    assert "churn_risk" in body
    assert "unread_signals" in body


# ---------------------------------------------------------------------------
# /insights/latest with valid auth (empty result is OK — no data seeded)
# ---------------------------------------------------------------------------

async def test_insights_latest_with_auth(bearer_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            "/insights/latest",
            headers={"Authorization": f"Bearer {bearer_token}"},
        )
    assert resp.status_code == 200
    assert "insight" in resp.json()
