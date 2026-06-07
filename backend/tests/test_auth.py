"""
Phase 3 — Authentication tests.

Covers: JWT issuance, bad credentials (401), auth guard on protected endpoints,
and the `client_id` claim in the token.

All fixtures are function-scoped so each test gets its own asyncpg pool and event loop
(same pattern as P2 conftest.py — avoids asyncio cross-loop errors with pytest-asyncio).

Requires: running DB + alembic upgrade head.  Tests skip if DB unavailable.
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

# Unique suffix per module import to avoid conflicts if cleanup fails mid-run
_RUN_ID = str(_uuid.uuid4())[:8]


# ---------------------------------------------------------------------------
# Function-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping auth tests.")
    yield
    await close_pool()


@pytest.fixture
async def seeded_user(db_pool):
    """
    Insert a test client+user; yield credentials; clean up after the test.
    Uses a unique suffix so parallel or sequential runs don't collide.
    """
    suffix = str(_uuid.uuid4())[:8]
    email_client = f"authco_{suffix}@unit.com"
    email_user = f"authuser_{suffix}@unit.com"
    password = "correct_password"

    conn = await asyncpg.connect(TEST_DB_DSN)
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"Auth Test Co {suffix}", email_client,
        )
        hashed = _pwd.hash(password)
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'admin') RETURNING id;",
            client_id, email_user, hashed,
        )
        yield {
            "user_id": str(user_id),
            "client_id": str(client_id),
            "email": email_user,
            "password": password,
        }
    finally:
        await conn.execute("DELETE FROM users WHERE email = $1;", email_user)
        await conn.execute("DELETE FROM clients WHERE email = $1;", email_client)
        await conn.close()


@pytest.fixture
async def http_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_login_returns_jwt(http_client, seeded_user):
    resp = await http_client.post(
        "/auth/token",
        data={"username": seeded_user["email"], "password": seeded_user["password"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_login_wrong_password(http_client, seeded_user):
    resp = await http_client.post(
        "/auth/token",
        data={"username": seeded_user["email"], "password": "wrong_password"},
    )
    assert resp.status_code == 401


async def test_login_unknown_user(http_client, db_pool):
    resp = await http_client.post(
        "/auth/token",
        data={"username": "nobody@unknown.com", "password": "any"},
    )
    assert resp.status_code == 401


async def test_protected_endpoint_requires_bearer(http_client):
    resp = await http_client.get("/insights/latest")
    assert resp.status_code == 401


async def test_jwt_contains_client_id(http_client, seeded_user):
    resp = await http_client.post(
        "/auth/token",
        data={"username": seeded_user["email"], "password": seeded_user["password"]},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    assert "client_id" in payload
    import uuid
    uuid.UUID(payload["client_id"])
    assert payload["client_id"] == seeded_user["client_id"]


async def test_garbage_token_returns_401(http_client):
    """A completely invalid Bearer token must return 401 (python-jose raises JWTError)."""
    resp = await http_client.get(
        "/insights/latest",
        headers={"Authorization": "Bearer this.is.not.a.jwt"},
    )
    assert resp.status_code == 401


async def test_expired_jwt_returns_401(http_client, db_pool):
    """A token with exp in the past must return 401."""
    from datetime import datetime, timedelta, timezone as _tz
    expired_payload = {
        "sub": "00000000-0000-0000-0000-000000000000",
        "client_id": "00000000-0000-0000-0000-000000000000",
        "exp": datetime.now(_tz.utc) - timedelta(minutes=5),
    }
    expired_token = jwt.encode(
        expired_payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    resp = await http_client.get(
        "/insights/latest",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401
