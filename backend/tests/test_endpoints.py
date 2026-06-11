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


async def test_clients_with_competitive_monitoring_returns_email(http_client, db_pool, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.get(
        "/api/clients/with-competitive-monitoring",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "clients" in data
    for client in data["clients"]:
        assert "email" in client


async def test_latest_report_for_client_returns_s3_url(http_client, n8n_client_id, monkeypatch):
    """Seed a report row, then confirm the endpoint reads the stored s3_key and
    routes it through report_service.presign_report_url (the raw-path code it
    replaced never did). Local runs have no AWS creds, so the signer is
    monkeypatched to a sentinel — a real signed URL is only produced in prod
    under the ECS task role; this test verifies the *wiring*, not the signature.
    """
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    import app.services.report_service as report_service
    sentinel = "https://signed.example/report.pdf?sig=abc"
    monkeypatch.setattr(report_service, "presign_report_url", lambda key, **kw: sentinel)

    s3_key = f"{n8n_client_id}/weekly_intelligence_20260612.pdf"
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute(
            "INSERT INTO reports (client_id, report_type, s3_key) VALUES ($1, $2, $3);",
            _uuid.UUID(n8n_client_id), "weekly_intelligence", s3_key,
        )
    finally:
        await conn.close()
    # report row is cascade-deleted when the n8n_client_id fixture deletes the client.

    resp = await http_client.get(
        f"/api/reports/latest-for-client?client_id={n8n_client_id}",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"] is not None
    assert data["report"]["s3_key"] == s3_key
    assert data["s3_url"] == sentinel


def test_presign_report_url_signs_and_degrades(monkeypatch):
    """presign_report_url returns a signed URL when boto3 can sign, None for an
    empty key, and None (never raises) when credentials don't resolve."""
    import app.services.report_service as report_service
    from botocore.exceptions import NoCredentialsError

    class _FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):
            return f"https://signed/{Params['Key']}?e={ExpiresIn}"

    monkeypatch.setattr(report_service.boto3, "client", lambda *a, **k: _FakeS3())
    assert report_service.presign_report_url("c/report.pdf").startswith("https://signed/c/report.pdf")
    assert report_service.presign_report_url(None) is None

    class _BrokenS3:
        def generate_presigned_url(self, *a, **k):
            raise NoCredentialsError()

    monkeypatch.setattr(report_service.boto3, "client", lambda *a, **k: _BrokenS3())
    assert report_service.presign_report_url("c/report.pdf") is None


async def test_latest_report_for_client_pins_report_id(http_client, n8n_client_id, monkeypatch):
    """With report_id, the endpoint returns THAT report — not the most recent —
    so WF03 emails the artifact it just generated, never a stale 'latest' PDF
    (the bug this run fixes). Seeds an older pinned report AND a newer one that
    would win a plain 'latest' query, then asserts the older pinned id wins.
    """
    from datetime import datetime, timezone, timedelta

    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    import app.services.report_service as report_service
    monkeypatch.setattr(report_service, "presign_report_url", lambda key, **kw: f"signed::{key}")

    rid_pinned = _uuid.uuid4()
    key_pinned = f"{n8n_client_id}/weekly_intelligence_20260605.pdf"
    key_newer = f"{n8n_client_id}/weekly_intelligence_20260612.pdf"
    now = datetime.now(timezone.utc)
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type, s3_key, created_at) "
            "VALUES ($1, $2, $3, $4, $5);",
            rid_pinned, _uuid.UUID(n8n_client_id), "weekly_intelligence",
            key_pinned, now - timedelta(days=7),
        )
        await conn.execute(  # newer row — would win an unpinned 'latest' query
            "INSERT INTO reports (client_id, report_type, s3_key, created_at) "
            "VALUES ($1, $2, $3, $4);",
            _uuid.UUID(n8n_client_id), "weekly_intelligence", key_newer, now,
        )
    finally:
        await conn.close()

    resp = await http_client.get(
        f"/api/reports/latest-for-client?client_id={n8n_client_id}&report_id={rid_pinned}",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"]["id"] == str(rid_pinned)
    assert data["report"]["s3_key"] == key_pinned     # pinned, not key_newer
    assert data["s3_url"] == f"signed::{key_pinned}"


async def test_latest_report_for_client_unknown_report_id_skips_send(http_client, n8n_client_id, monkeypatch):
    """If this run's report isn't generated yet (slow/failed), fetching its id
    returns no row and no s3_url, so WF03's 'Report Ready?' guard skips the send
    rather than emailing a stale report."""
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.get(
        f"/api/reports/latest-for-client?client_id={n8n_client_id}&report_id={_uuid.uuid4()}",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"] is None
    assert data["s3_url"] is None


async def test_churn_webhook_requires_internal_secret(http_client, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    resp = await http_client.post("/webhook/churn-alert", json={"client_id": "x"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Background dispatch timing (< 100ms)
# ---------------------------------------------------------------------------

async def test_analyze_returns_202_immediately(http_client, bearer_token, monkeypatch):
    # Monkeypatch the background function to a no-op so we measure pure dispatch time,
    # not agent execution: ASGITransport runs background tasks to completion before
    # post() returns when the event loop is otherwise idle (isolation / CI).
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.insights._run_voc_analysis", _noop)
    start = time.monotonic()
    resp = await http_client.post(
        "/insights/analyze",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 202
    assert resp.json()["status"] == "analysis_queued"
    assert elapsed_ms < 100, f"/insights/analyze took {elapsed_ms:.1f}ms — must be < 100ms"


async def test_signals_analyze_returns_202_immediately(http_client, bearer_token, monkeypatch):
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.signals._run_comp_signal_analysis", _noop)
    start = time.monotonic()
    resp = await http_client.post(
        "/signals/analyze",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    elapsed_ms = (time.monotonic() - start) * 1000
    assert resp.status_code == 202
    assert elapsed_ms < 100, f"/signals/analyze took {elapsed_ms:.1f}ms — must be < 100ms"


async def test_journeys_analyze_returns_202_immediately(http_client, bearer_token, monkeypatch):
    async def _noop(**kw): pass
    monkeypatch.setattr("app.routers.journeys._run_journey_analysis", _noop)
    start = time.monotonic()
    resp = await http_client.post(
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


async def test_reports_generate_returns_report_id(n8n_client_id):
    """The trigger pre-allocates and returns report_id so WF03 can pin the exact
    artifact it generated (anti-stale — §13)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/reports/generate",
            headers=_N8N_HEADERS,
            json={"client_id": n8n_client_id, "report_type": "weekly_intelligence"},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "report_queued"
    assert body.get("report_id")


async def test_reports_duplicate_s3key_does_not_create_second_row(http_client, n8n_client_id, monkeypatch):
    """Duplicate-send protection: two reports with the same (client_id, s3_key) may not
    both land in the DB.  The second INSERT uses ON CONFLICT DO NOTHING, so its
    report_id is never committed → the second WF03 run's pinned fetch returns null →
    routes to safe-skip instead of sending a duplicate email."""
    from datetime import datetime, timezone

    import asyncpg

    monkeypatch.setattr(settings, "n8n_webhook_secret", "test-internal-secret")
    import app.services.report_service as report_service
    monkeypatch.setattr(report_service, "presign_report_url", lambda key, **kw: f"signed::{key}")

    shared_s3_key = f"{n8n_client_id}/weekly_intelligence_20260611.pdf"
    rid_first = _uuid.uuid4()
    rid_second = _uuid.uuid4()
    now = datetime.now(timezone.utc)

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        # Simulate first run succeeding
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type, s3_key, created_at) "
            "VALUES ($1, $2, $3, $4, $5);",
            rid_first, _uuid.UUID(n8n_client_id), "weekly_intelligence", shared_s3_key, now,
        )
        # Simulate second run trying same s3_key — must be silently skipped
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type, s3_key, created_at) "
            "VALUES ($1, $2, $3, $4, $5) ON CONFLICT (client_id, s3_key) DO NOTHING;",
            rid_second, _uuid.UUID(n8n_client_id), "weekly_intelligence", shared_s3_key, now,
        )
        # Only one row should exist
        count = await conn.fetchval(
            "SELECT count(*) FROM reports WHERE client_id = $1 AND s3_key = $2;",
            _uuid.UUID(n8n_client_id), shared_s3_key,
        )
    finally:
        await conn.close()
    assert count == 1, f"Expected 1 row, got {count} — duplicate-send protection broken"

    # Second run's report_id should return null (no row inserted for it)
    resp = await http_client.get(
        f"/api/reports/latest-for-client?client_id={n8n_client_id}&report_id={rid_second}",
        headers={"X-N8N-Webhook-Secret": "test-internal-secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"] is None
    assert data["s3_url"] is None


# ---------------------------------------------------------------------------
# Report download URL (dashboard — JWT-scoped, short-lived presign)
# ---------------------------------------------------------------------------

def _client_id_from_token(token: str) -> str:
    from jose import jwt as _jwt
    claims = _jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    return claims["client_id"]


async def test_report_download_url_returns_short_lived_presign(http_client, bearer_token, monkeypatch):
    """Own report with an s3_key → 200 with a presigned URL minted at 15-min
    expiry (not the 7-day n8n email TTL)."""
    import app.services.report_service as report_service
    captured: dict = {}

    def _fake_presign(key, **kw):
        captured["key"] = key
        captured["expires_in"] = kw.get("expires_in")
        return f"signed::{key}"

    monkeypatch.setattr(report_service, "presign_report_url", _fake_presign)

    client_id = _client_id_from_token(bearer_token)
    rid = _uuid.uuid4()
    s3_key = f"{client_id}/weekly_intelligence_20260611.pdf"
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type, s3_key) VALUES ($1, $2, $3, $4);",
            rid, _uuid.UUID(client_id), "weekly_intelligence", s3_key,
        )
    finally:
        await conn.close()
    # row cascade-deletes with the bearer_token fixture's client.

    resp = await http_client.get(
        f"/api/reports/{rid}/download-url",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["url"] == f"signed::{s3_key}"
    assert captured["expires_in"] == 900


async def test_report_download_url_cross_client_404(http_client, bearer_token, n8n_client_id, monkeypatch):
    """Another client's report_id 404s — identical to a nonexistent id, no
    existence leak across tenants (§6)."""
    import app.services.report_service as report_service
    monkeypatch.setattr(report_service, "presign_report_url", lambda key, **kw: f"signed::{key}")

    rid = _uuid.uuid4()
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type, s3_key) VALUES ($1, $2, $3, $4);",
            rid, _uuid.UUID(n8n_client_id), "weekly_intelligence",
            f"{n8n_client_id}/weekly_intelligence_20260611.pdf",
        )
    finally:
        await conn.close()

    # bearer_token belongs to a different client than n8n_client_id
    resp = await http_client.get(
        f"/api/reports/{rid}/download-url",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    assert resp.status_code == 404


async def test_report_download_url_missing_s3_key_404(http_client, bearer_token):
    """A row whose PDF was never uploaded (s3_key NULL) 404s — nothing to sign."""
    client_id = _client_id_from_token(bearer_token)
    rid = _uuid.uuid4()
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        await conn.execute(
            "INSERT INTO reports (id, client_id, report_type) VALUES ($1, $2, $3);",
            rid, _uuid.UUID(client_id), "weekly_intelligence",
        )
    finally:
        await conn.close()

    resp = await http_client.get(
        f"/api/reports/{rid}/download-url",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    assert resp.status_code == 404


async def test_report_download_url_malformed_id_404(http_client, bearer_token):
    resp = await http_client.get(
        "/api/reports/not-a-uuid/download-url",
        headers={"Authorization": f"Bearer {bearer_token}"},
    )
    assert resp.status_code == 404


async def test_report_download_url_requires_auth(http_client):
    resp = await http_client.get(f"/api/reports/{_uuid.uuid4()}/download-url")
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


# ---------------------------------------------------------------------------
# Data sources — one active source per type per client (CLAUDE.md §8)
# bearer_token teardown deletes the client, cascading the data_sources rows.
# ---------------------------------------------------------------------------

async def test_data_source_duplicate_type_returns_409(bearer_token):
    headers = {"Authorization": f"Bearer {bearer_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        first = await ac.post("/api/data-sources", headers=headers, json={"source_type": "zendesk"})
        second = await ac.post("/api/data-sources", headers=headers, json={"source_type": "zendesk"})
    assert first.status_code == 201, f"first connect should succeed: {first.json()}"
    assert second.status_code == 409, "a second active source of the same type must be rejected"
