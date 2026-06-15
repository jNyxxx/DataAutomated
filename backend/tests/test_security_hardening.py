"""
Security-hardening tests for the June 2026 launch-audit remediation.

Covers:
  P3-01  Password policy   — validate_password_strength enforces strength (pure unit).
  LB-06 / SR-07 fail-closed — production config rejects wildcard hosts / CORS (pure unit).
  SR-01  JWT revocation    — /auth/logout denylists the token (rejected on reuse).
  P3-02  Account lockout    — N failed logins lock the account (429), even with right pw.
  SR-02  SSE tickets in PG  — /api/sse-ticket persists to Postgres; bogus ticket → 401.

DB-backed tests skip if the database is unreachable. Pure-unit tests always run.
"""

from __future__ import annotations

import os
import uuid as _uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from passlib.context import CryptContext
from pydantic import ValidationError

from app.config import settings
from app.database import close_pool, init_pool
from app.main import app

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Pure unit tests (no DB)
# ---------------------------------------------------------------------------

class TestPasswordPolicy:
    def test_rejects_weak_password(self):
        from fastapi import HTTPException

        from app.routers.auth import validate_password_strength

        with pytest.raises(HTTPException):
            validate_password_strength("short")

    def test_accepts_strong_password(self):
        from app.routers.auth import validate_password_strength

        validate_password_strength("Str0ng!Passw0rd")  # must not raise


class TestProductionFailClosed:
    @staticmethod
    def _kwargs(**overrides):
        base = dict(
            app_env="production",
            jwt_secret_key="x" * 40,
            credential_encryption_key="y" * 40,
            database_dsn="postgresql://u:p@db:5432/app",
            openai_api_key="sk-test",
            cors_origins=["https://app.example.com"],
            allowed_hosts=["app.example.com"],
        )
        base.update(overrides)
        return base

    def test_wildcard_hosts_rejected_in_production(self):
        from app.config import Settings

        with pytest.raises((ValidationError, ValueError)):
            Settings(**self._kwargs(allowed_hosts=["*"]))

    def test_wildcard_cors_rejected_in_production(self):
        from app.config import Settings

        with pytest.raises((ValidationError, ValueError)):
            Settings(**self._kwargs(cors_origins=["*"]))

    def test_explicit_production_config_is_accepted(self):
        from app.config import Settings

        s = Settings(**self._kwargs())
        assert s.app_env == "production"


# ---------------------------------------------------------------------------
# DB-backed fixtures (mirror test_auth.py — function-scoped pool per test)
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping hardening tests.")
    yield
    await close_pool()


@pytest.fixture
async def http_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def seeded_user(db_pool):
    suffix = str(_uuid.uuid4())[:8]
    email_client = f"hardco_{suffix}@unit.com"
    email_user = f"harduser_{suffix}@unit.com"
    password = "correct_password"

    conn = await asyncpg.connect(TEST_DB_DSN)
    user_id = None
    client_id = None
    try:
        client_id = await conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"Hardening Co {suffix}", email_client,
        )
        user_id = await conn.fetchval(
            "INSERT INTO users (client_id, email, hashed_password, role) "
            "VALUES ($1, $2, $3, 'admin') RETURNING id;",
            client_id, email_user, _pwd.hash(password),
        )
        yield {
            "user_id": str(user_id),
            "client_id": str(client_id),
            "email": email_user,
            "password": password,
        }
    finally:
        if user_id is not None:
            await conn.execute("DELETE FROM token_denylist WHERE user_id = $1;", user_id)
        if client_id is not None:
            await conn.execute("DELETE FROM sse_tickets WHERE client_id = $1;", client_id)
        await conn.execute("DELETE FROM login_attempts WHERE identifier = $1;", email_user.lower())
        await conn.execute("DELETE FROM users WHERE email = $1;", email_user)
        await conn.execute("DELETE FROM clients WHERE email = $1;", email_client)
        await conn.close()


async def _token(http_client: AsyncClient, seeded_user: dict) -> str:
    resp = await http_client.post(
        "/auth/token",
        data={"username": seeded_user["email"], "password": seeded_user["password"]},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# SR-01 — token revocation
# ---------------------------------------------------------------------------

class TestTokenRevocation:
    async def test_logout_revokes_token(self, http_client, seeded_user):
        token = await _token(http_client, seeded_user)
        headers = {"Authorization": f"Bearer {token}"}

        assert (await http_client.get("/auth/me", headers=headers)).status_code == 200
        assert (await http_client.post("/auth/logout", headers=headers)).status_code == 200
        # Reusing the same token after logout must be rejected (shared denylist).
        assert (await http_client.get("/auth/me", headers=headers)).status_code == 401


# ---------------------------------------------------------------------------
# P3-02 — account lockout
# ---------------------------------------------------------------------------

class TestAccountLockout:
    async def test_lockout_after_threshold(self, http_client, seeded_user):
        for _ in range(settings.login_max_failed_attempts):
            resp = await http_client.post(
                "/auth/token",
                data={"username": seeded_user["email"], "password": "wrong"},
            )
            assert resp.status_code == 401

        # The lock now applies even to the correct password.
        resp = await http_client.post(
            "/auth/token",
            data={"username": seeded_user["email"], "password": seeded_user["password"]},
        )
        assert resp.status_code == 429
        assert "retry-after" in {k.lower() for k in resp.headers}


# ---------------------------------------------------------------------------
# SR-02 — SSE tickets persisted in Postgres
# ---------------------------------------------------------------------------

class TestSSETickets:
    async def test_ticket_issued_and_persisted(self, http_client, seeded_user):
        token = await _token(http_client, seeded_user)
        resp = await http_client.post(
            "/api/sse-ticket", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        ticket = resp.json()["ticket"]

        conn = await asyncpg.connect(TEST_DB_DSN)
        try:
            stored = await conn.fetchval(
                "SELECT client_id FROM sse_tickets WHERE ticket = $1", ticket
            )
        finally:
            await conn.close()
        assert stored is not None, "ticket must be persisted in Postgres (SR-02)"
        assert str(stored) == seeded_user["client_id"]

    async def test_invalid_ticket_rejected(self, http_client, db_pool):
        resp = await http_client.get(
            "/stream/insights", params={"ticket": "bogus-" + _uuid.uuid4().hex}
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# SR-04 — GDPR erase-and-anonymise
# ---------------------------------------------------------------------------

class TestGDPRErasure:
    async def test_erase_client_removes_pii_and_anonymises_shell(self, db_pool):
        from app.services.gdpr_service import erase_client

        suffix = _uuid.uuid4().hex[:8]
        conn = await asyncpg.connect(TEST_DB_DSN)
        cid = None
        try:
            cid = await conn.fetchval(
                "INSERT INTO clients (name, email) VALUES ('Erase Me', $1) RETURNING id;",
                f"erase_{suffix}@unit.com",
            )
            await conn.execute(
                "INSERT INTO users (client_id, email, hashed_password, role) "
                "VALUES ($1, $2, 'x', 'admin');",
                cid, f"eraseuser_{suffix}@unit.com",
            )
            await conn.execute(
                "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'pii text');", cid
            )

            counts = await erase_client(cid, requested_by="tester")
            assert counts["users"] >= 1
            assert counts["raw_feedback"] >= 1

            users_left = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE client_id = $1;", cid
            )
            assert users_left == 0, "users must be erased"

            row = await conn.fetchrow(
                "SELECT name, is_active, email FROM clients WHERE id = $1;", cid
            )
            assert row["name"] == "ERASED"
            assert row["is_active"] is False
            assert row["email"].startswith("erased+"), "tenant root must be anonymised"
        finally:
            if cid is not None:
                await conn.execute("DELETE FROM clients WHERE id = $1;", cid)
            await conn.close()
