"""
RBAC enforcement tests (CLAUDE.md §10; P2.4).

Verifies that require_role() correctly gates access:
  - viewer  → 403 on all write/trigger endpoints
  - analyst → 202 on agent-trigger endpoints; 403 on data-source credential writes
  - admin   → 202/2xx on all protected write endpoints

Requires a running database (tests skip if DB is unavailable).

Protected endpoints under test:
  POST /insights/analyze    — require_role("admin", "analyst")
  POST /signals/analyze     — require_role("admin", "analyst")
  POST /journeys/analyze    — require_role("admin", "analyst")
  POST /api/data-sources    — require_role("admin")
  PATCH /api/data-sources/{id} — require_role("admin")
  POST /api/reports/generate   — inline admin|analyst check
"""

from __future__ import annotations

import os
import uuid as _uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt
from passlib.context import CryptContext

from app.config import settings
from app.database import close_pool, init_pool
from app.main import app

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping RBAC tests.")
    yield
    await close_pool()


@pytest.fixture
async def http_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _make_user(conn: asyncpg.Connection, suffix: str, role: str) -> dict:
    """Insert a client + user with the given role; return credentials dict."""
    client_id = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
        f"RBAC Co {role} {suffix}", f"rbac_{role}_{suffix}@unit.com",
    )
    user_id = await conn.fetchval(
        "INSERT INTO users (client_id, email, hashed_password, role) "
        "VALUES ($1, $2, $3, $4) RETURNING id;",
        client_id, f"rbac_user_{role}_{suffix}@unit.com",
        _pwd.hash("pass"), role,
    )
    token = jwt.encode(
        {"sub": str(user_id), "client_id": str(client_id)},
        settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
    )
    return {"user_id": str(user_id), "client_id": str(client_id), "token": token}


@pytest.fixture
async def three_users(db_pool):
    """Seed an admin, analyst, and viewer; clean up after test."""
    suffix = str(_uuid.uuid4())[:8]
    conn = await asyncpg.connect(TEST_DB_DSN)
    viewer  = await _make_user(conn, suffix, "viewer")
    analyst = await _make_user(conn, suffix, "analyst")
    admin   = await _make_user(conn, suffix, "admin")
    yield {"viewer": viewer, "analyst": analyst, "admin": admin}
    # Teardown: delete users then clients (FK order)
    for u in [viewer, analyst, admin]:
        await conn.execute("DELETE FROM users WHERE id = $1;", _uuid.UUID(u["user_id"]))
        await conn.execute("DELETE FROM clients WHERE id = $1;", _uuid.UUID(u["client_id"]))
    await conn.close()


# ---------------------------------------------------------------------------
# Agent-trigger endpoints: require_role("admin", "analyst")
# ---------------------------------------------------------------------------

class TestAgentTriggerRBAC:
    @pytest.mark.parametrize("path", [
        "/insights/analyze",
        "/signals/analyze",
        "/journeys/analyze",
    ])
    async def test_viewer_cannot_trigger_agents(self, http_client, three_users, path):
        resp = await http_client.post(
            path, headers={"Authorization": f"Bearer {three_users['viewer']['token']}"}
        )
        assert resp.status_code == 403, (
            f"viewer must be denied {path}; got {resp.status_code}"
        )

    @pytest.mark.parametrize("path", [
        "/insights/analyze",
        "/signals/analyze",
        "/journeys/analyze",
    ])
    async def test_analyst_can_trigger_agents(self, http_client, three_users, path):
        resp = await http_client.post(
            path, headers={"Authorization": f"Bearer {three_users['analyst']['token']}"}
        )
        # 202 = queued; 503 = OpenAI not configured but auth passed
        assert resp.status_code in (202, 503), (
            f"analyst must be allowed {path}; got {resp.status_code}: {resp.text}"
        )

    @pytest.mark.parametrize("path", [
        "/insights/analyze",
        "/signals/analyze",
        "/journeys/analyze",
    ])
    async def test_admin_can_trigger_agents(self, http_client, three_users, path):
        resp = await http_client.post(
            path, headers={"Authorization": f"Bearer {three_users['admin']['token']}"}
        )
        assert resp.status_code in (202, 503), (
            f"admin must be allowed {path}; got {resp.status_code}: {resp.text}"
        )


# ---------------------------------------------------------------------------
# Data-source credential endpoints: require_role("admin")
# ---------------------------------------------------------------------------

class TestDataSourceRBAC:
    async def test_viewer_cannot_create_data_source(self, http_client, three_users):
        resp = await http_client.post(
            "/api/data-sources",
            json={"source_type": "zendesk", "credentials": {}, "config": {}},
            headers={"Authorization": f"Bearer {three_users['viewer']['token']}"},
        )
        assert resp.status_code == 403

    async def test_analyst_cannot_create_data_source(self, http_client, three_users):
        resp = await http_client.post(
            "/api/data-sources",
            json={"source_type": "zendesk", "credentials": {}, "config": {}},
            headers={"Authorization": f"Bearer {three_users['analyst']['token']}"},
        )
        assert resp.status_code == 403

    async def test_admin_can_create_data_source(self, http_client, three_users):
        """Admin gets past RBAC; 409 means it reached the DB-uniqueness check (OK)."""
        resp = await http_client.post(
            "/api/data-sources",
            json={"source_type": "zendesk", "credentials": {}, "config": {}},
            headers={"Authorization": f"Bearer {three_users['admin']['token']}"},
        )
        assert resp.status_code in (200, 201, 409), (
            f"admin must be allowed; got {resp.status_code}: {resp.text}"
        )

    async def test_viewer_cannot_patch_data_source(self, http_client, three_users):
        fake_id = str(_uuid.uuid4())
        resp = await http_client.patch(
            f"/api/data-sources/{fake_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {three_users['viewer']['token']}"},
        )
        assert resp.status_code == 403

    async def test_analyst_cannot_patch_data_source(self, http_client, three_users):
        fake_id = str(_uuid.uuid4())
        resp = await http_client.patch(
            f"/api/data-sources/{fake_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {three_users['analyst']['token']}"},
        )
        assert resp.status_code == 403

    async def test_admin_can_patch_data_source(self, http_client, three_users):
        """Admin gets past RBAC; 404 means it reached the DB lookup (OK)."""
        fake_id = str(_uuid.uuid4())
        resp = await http_client.patch(
            f"/api/data-sources/{fake_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {three_users['admin']['token']}"},
        )
        assert resp.status_code in (200, 404), (
            f"admin must be allowed; got {resp.status_code}: {resp.text}"
        )


# ---------------------------------------------------------------------------
# Report-generate endpoint: require admin|analyst
# ---------------------------------------------------------------------------

class TestReportRBAC:
    async def test_viewer_cannot_generate_report(self, http_client, three_users):
        resp = await http_client.post(
            "/api/reports/generate",
            json={"report_type": "weekly_intelligence", "period": "last_7_days"},
            headers={"Authorization": f"Bearer {three_users['viewer']['token']}"},
        )
        assert resp.status_code == 403

    async def test_analyst_can_trigger_report_generate(self, http_client, three_users):
        resp = await http_client.post(
            "/api/reports/generate",
            json={"report_type": "weekly_intelligence", "period": "last_7_days"},
            headers={"Authorization": f"Bearer {three_users['analyst']['token']}"},
        )
        # 202 = queued; 200 = accepted; any 2xx means RBAC passed
        assert resp.status_code < 400, (
            f"analyst must be allowed; got {resp.status_code}: {resp.text}"
        )
