"""
JWT client_id rebind + inactive-client tests (CLAUDE.md §10; P2.3).

Verifies that get_current_user() correctly enforces identity rebinding:
  - Token carrying a mismatched client_id (tampered claim) → 401
  - Token for a user whose client is inactive → 403

Requires a running database (tests skip if DB is unavailable).
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

# A stable protected endpoint to hit (GET — simple, no body required).
_GUARDED = "/insights/latest"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping rebind tests.")
    yield
    await close_pool()


@pytest.fixture
async def http_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_tampered_client_id_claim_returns_401(http_client, db_pool):
    """
    A JWT whose client_id claim does NOT match the user's real client in the DB
    must return 401 — prevents an attacker from forging cross-tenant access.
    """
    suffix = str(_uuid.uuid4())[:8]
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        real_client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"Rebind Real {suffix}", f"rebind_real_{suffix}@unit.com",
        )
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'viewer') RETURNING id;",
            real_client_id, f"rebind_user_{suffix}@unit.com", _pwd.hash("pass"),
        )
        # Forge a token: correct user sub, but a completely different client_id.
        fake_client_id = str(_uuid.uuid4())
        tampered_token = jwt.encode(
            {"sub": str(user_id), "client_id": fake_client_id},
            settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
        )
        resp = await http_client.get(
            _GUARDED, headers={"Authorization": f"Bearer {tampered_token}"}
        )
        assert resp.status_code == 401, (
            f"Tampered client_id must yield 401; got {resp.status_code}"
        )
    finally:
        await conn.execute("DELETE FROM users WHERE id = $1;", user_id)
        await conn.execute("DELETE FROM clients WHERE id = $1;", real_client_id)
        await conn.close()


async def test_inactive_client_returns_403(http_client, db_pool):
    """
    A valid JWT for a user whose client has is_active = FALSE must return 403.
    """
    suffix = str(_uuid.uuid4())[:8]
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email, is_active) VALUES ($1, $2, FALSE) RETURNING id;",
            f"Inactive Co {suffix}", f"inactive_{suffix}@unit.com",
        )
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'admin') RETURNING id;",
            client_id, f"inactive_user_{suffix}@unit.com", _pwd.hash("pass"),
        )
        token = jwt.encode(
            {"sub": str(user_id), "client_id": str(client_id)},
            settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
        )
        resp = await http_client.get(
            _GUARDED, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403, (
            f"Inactive client must yield 403; got {resp.status_code}"
        )
    finally:
        await conn.execute("DELETE FROM users WHERE id = $1;", user_id)
        await conn.execute("DELETE FROM clients WHERE id = $1;", client_id)
        await conn.close()


async def test_valid_active_user_allowed(http_client, db_pool):
    """
    A correct JWT for an active user+client must NOT be rejected by the rebind check.
    (401 or 403 means the rebind guard is misconfigured.)
    """
    suffix = str(_uuid.uuid4())[:8]
    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email, is_active) VALUES ($1, $2, TRUE) RETURNING id;",
            f"Active Co {suffix}", f"active_{suffix}@unit.com",
        )
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'viewer') RETURNING id;",
            client_id, f"active_user_{suffix}@unit.com", _pwd.hash("pass"),
        )
        token = jwt.encode(
            {"sub": str(user_id), "client_id": str(client_id)},
            settings.jwt_secret_key, algorithm=settings.jwt_algorithm,
        )
        resp = await http_client.get(
            _GUARDED, headers={"Authorization": f"Bearer {token}"}
        )
        # 200 (data returned) or 200 with empty list — both are fine
        # The key assertion: not 401 or 403 (which would mean rebind check is broken).
        assert resp.status_code not in (401, 403), (
            f"Active user must pass rebind; got {resp.status_code}: {resp.text}"
        )
    finally:
        await conn.execute("DELETE FROM users WHERE id = $1;", user_id)
        await conn.execute("DELETE FROM clients WHERE id = $1;", client_id)
        await conn.close()
