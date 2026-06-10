"""
Phase 4 audit-trail tests (CLAUDE.md §14 — "complete audit trail for all data
access and AI agent actions"; §16 — every new feature has a test).

Three layers, mirroring the existing suite:

  1. TestAuditLogRLS  — tx_conn + `SET LOCAL ROLE app_runtime`, always rolled
     back (same mechanism as test_rls.py).  Exercises the audit_log RLS policies
     and the append-only guarantee that comes from policy *absence*.
  2. TestRecordAuditService  — live pool + admin_conn with explicit cleanup
     (same pattern as test_ingestion_service.py).  Proves record_audit() actually
     persists a client-scoped row and a system (NULL) row, and never raises.
  3. TestAuditMiddleware  — pure unit, no DB.  Covers _audit_identity() claim
     extraction and AuditMiddleware's exempt-path / method skips — the actual
     §14 trigger that records every API request.

audit_log RLS semantics (migration 0002), locked in by the tests below:
  - client_isolation (SELECT): client_id = app.current_client_id.  A system row
    (client_id IS NULL) matches NO tenant — `NULL = <ctx>` is NULL, never TRUE —
    so system rows are readable by NO ONE under RLS; only the superuser pool
    bypass sees them.  This is deliberately UNLIKE knowledge_embeddings, whose
    policy carries an explicit `OR client_id IS NULL` to make globals readable.
  - audit_insert (INSERT, WITH CHECK): own-tenant rows OR NULL system rows.
  - No UPDATE/DELETE policy → append-only for app_runtime (RLS default-deny on a
    command type with no permissive policy → 0 rows affected, silently).

DB-dependent tests skip automatically when the database is unreachable.
The middleware tests need no database and always run.  asyncio_mode = auto.
"""

from __future__ import annotations

import json
import os
import uuid

import asyncpg
import pytest
from jose import jwt

from app.config import settings
from app.database import close_pool, init_pool

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)


# ---------------------------------------------------------------------------
# Helpers (table-level, run under tx_conn from conftest.py)
# ---------------------------------------------------------------------------

async def _seed_two_clients(conn: asyncpg.Connection) -> tuple[uuid.UUID, uuid.UUID]:
    a = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ('Audit A', 'audit_a@audit-test.com') RETURNING id;"
    )
    b = await conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ('Audit B', 'audit_b@audit-test.com') RETURNING id;"
    )
    return a, b


async def _switch_to_app_runtime(conn: asyncpg.Connection, client_id: uuid.UUID) -> None:
    """Mirror of test_rls helper — non-superuser role + tenant context, tx-scoped."""
    await conn.execute("SET LOCAL ROLE app_runtime;")
    await conn.fetchval(
        "SELECT set_config('app.current_client_id', $1, TRUE);", str(client_id)
    )


# ---------------------------------------------------------------------------
# 1. Table-level RLS + append-only
# ---------------------------------------------------------------------------

class TestAuditLogRLS:
    async def test_tenant_sees_only_own_audit_rows(self, tx_conn: asyncpg.Connection):
        a_id, b_id = await _seed_two_clients(tx_conn)
        a_row = await tx_conn.fetchval(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store') RETURNING id;",
            a_id,
        )
        await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store');", b_id
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch("SELECT id, client_id FROM audit_log;")
        ids = [r["id"] for r in rows]
        assert a_row in ids, "Client A's audit row must be visible"
        assert all(r["client_id"] == a_id for r in rows), (
            "Only client A's audit rows may be visible under context A"
        )

    async def test_system_null_rows_not_visible_to_tenant(self, tx_conn: asyncpg.Connection):
        """System rows (client_id IS NULL) are NOT tenant-readable — unlike knowledge_embeddings globals."""
        a_id, _ = await _seed_two_clients(tx_conn)
        sys_row = await tx_conn.fetchval(
            "INSERT INTO audit_log (client_id, action, actor) "
            "VALUES (NULL, 'auth.failure', 'unknown') RETURNING id;"
        )
        a_row = await tx_conn.fetchval(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store') RETURNING id;",
            a_id,
        )

        await _switch_to_app_runtime(tx_conn, a_id)

        rows = await tx_conn.fetch("SELECT id, client_id FROM audit_log;")
        ids = [r["id"] for r in rows]
        assert a_row in ids, "Client A's own row must be visible"
        assert sys_row not in ids, (
            "System NULL rows must NOT be readable by a tenant (no `OR client_id IS NULL` branch)"
        )
        assert all(r["client_id"] is not None for r in rows)

    async def test_no_context_fails_closed(self, tx_conn: asyncpg.Connection):
        """No tenant context → empty result, including for system NULL rows."""
        a_id, _ = await _seed_two_clients(tx_conn)
        await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store');", a_id
        )
        await tx_conn.execute("INSERT INTO audit_log (client_id, action) VALUES (NULL, 'auth.failure');")

        await tx_conn.execute("SET LOCAL ROLE app_runtime;")  # role only — no set_config

        rows = await tx_conn.fetch("SELECT * FROM audit_log;")
        assert len(rows) == 0, (
            "Missing context must fail closed — system NULL rows are readable by no one under RLS"
        )

    async def test_insert_own_tenant_allowed(self, tx_conn: asyncpg.Connection):
        a_id, _ = await _seed_two_clients(tx_conn)
        await _switch_to_app_runtime(tx_conn, a_id)

        status = await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action, actor) VALUES ($1, 'agent.store', 'voc_agent');",
            a_id,
        )
        assert status == "INSERT 0 1", "WITH CHECK must permit an own-tenant insert"
        n = await tx_conn.fetchval(
            "SELECT COUNT(*) FROM audit_log WHERE client_id = $1 AND action = 'agent.store';", a_id
        )
        assert n == 1

    async def test_insert_null_system_row_allowed(self, tx_conn: asyncpg.Connection):
        """
        WITH CHECK permits NULL system rows even under a tenant context.
        Verify via the command tag, NOT a read-back: client_isolation hides NULL
        rows from this tenant context, so a SELECT would (correctly) return 0 —
        which would mask whether the insert itself succeeded.
        """
        a_id, _ = await _seed_two_clients(tx_conn)
        await _switch_to_app_runtime(tx_conn, a_id)

        status = await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action, actor) VALUES (NULL, 'auth.failure', 'unknown');"
        )
        assert status == "INSERT 0 1", "WITH CHECK NULL branch must permit system-event inserts"

    async def test_insert_cross_tenant_blocked(self, tx_conn: asyncpg.Connection):
        """Context A inserting a client_id=B row violates WITH CHECK (RLS denies)."""
        a_id, b_id = await _seed_two_clients(tx_conn)
        await _switch_to_app_runtime(tx_conn, a_id)

        with pytest.raises(asyncpg.PostgresError) as exc:
            await tx_conn.execute(
                "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store');", b_id
            )
        assert "row-level security" in str(exc.value).lower()

    async def test_update_is_append_only(self, tx_conn: asyncpg.Connection):
        """No UPDATE policy → app_runtime can never rewrite history (UPDATE 0)."""
        a_id, _ = await _seed_two_clients(tx_conn)
        await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store');", a_id
        )
        await _switch_to_app_runtime(tx_conn, a_id)

        status = await tx_conn.execute(
            "UPDATE audit_log SET action = 'tampered' WHERE client_id = $1;", a_id
        )
        assert status == "UPDATE 0", "audit_log is append-only — no UPDATE policy → 0 rows"

    async def test_delete_is_append_only(self, tx_conn: asyncpg.Connection):
        """No DELETE policy → app_runtime can never erase history (DELETE 0)."""
        a_id, _ = await _seed_two_clients(tx_conn)
        await tx_conn.execute(
            "INSERT INTO audit_log (client_id, action) VALUES ($1, 'agent.store');", a_id
        )
        await _switch_to_app_runtime(tx_conn, a_id)

        status = await tx_conn.execute(
            "DELETE FROM audit_log WHERE client_id = $1;", a_id
        )
        assert status == "DELETE 0", "audit_log is append-only — no DELETE policy → 0 rows"


# ---------------------------------------------------------------------------
# 2. record_audit() service — live pool, explicit cleanup
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping audit-service tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    """Superuser connection for seeding + verification (bypasses RLS to read NULL rows)."""
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping audit-service tests.")
    yield conn
    await conn.close()


class TestRecordAuditService:
    async def test_persists_client_scoped_row(self, db_pool, admin_conn):
        from app.services.audit_service import record_audit

        client_id = await admin_conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id;",
            f"Audit Svc {uuid.uuid4().hex[:8]}",
            f"auditsvc_{uuid.uuid4().hex[:8]}@audit-test.com",
        )
        try:
            await record_audit(
                "agent.store",
                client_id=client_id,
                actor="voc_agent",
                resource="feedback_insights",
                detail={"items": 3, "churn_risk": 0.2},
            )
            row = await admin_conn.fetchrow(
                "SELECT client_id, actor, action, resource, detail FROM audit_log WHERE client_id = $1;",
                client_id,
            )
            assert row is not None, "record_audit must persist a client-scoped row"
            assert row["client_id"] == client_id
            assert row["action"] == "agent.store"
            assert row["actor"] == "voc_agent"
            assert row["resource"] == "feedback_insights"
            assert json.loads(row["detail"])["items"] == 3
        finally:
            # ON DELETE CASCADE removes the audit_log row with its client.
            await admin_conn.execute("DELETE FROM clients WHERE id = $1;", client_id)

    async def test_persists_system_row(self, db_pool, admin_conn):
        from app.services.audit_service import record_audit

        marker = f"sysactor_{uuid.uuid4().hex}"
        try:
            await record_audit(
                "auth.failure",
                actor=marker,
                resource="POST /auth/token",
                detail={"reason": "invalid_credentials"},
            )
            row = await admin_conn.fetchrow(
                "SELECT client_id, action, actor FROM audit_log WHERE actor = $1;", marker
            )
            assert row is not None, "record_audit must persist a system (NULL client) row"
            assert row["client_id"] is None, "System events carry no tenant context"
            assert row["action"] == "auth.failure"
        finally:
            await admin_conn.execute("DELETE FROM audit_log WHERE actor = $1;", marker)


# ---------------------------------------------------------------------------
# 2b. record_audit() best-effort contract — pure unit, no DB
# ---------------------------------------------------------------------------

class TestRecordAuditBestEffort:
    async def test_noop_when_pool_uninitialized(self, monkeypatch):
        import app.database as _db
        from app.services import audit_service

        monkeypatch.setattr(_db, "pool", None)
        # Pool not initialized → silent no-op, never raises.
        assert await audit_service.record_audit("auth.failure", actor="nobody") is None

    async def test_swallows_write_errors(self, monkeypatch):
        import app.database as _db
        from app.services import audit_service

        monkeypatch.setattr(_db, "pool", object())  # truthy → passes the None guard

        def _boom(_client_id):
            raise RuntimeError("db connection exploded")

        monkeypatch.setattr(audit_service, "acquire_for_client", _boom)
        # A broken write must never propagate into the agent/request it describes.
        await audit_service.record_audit(
            "agent.store", client_id=uuid.uuid4(), actor="voc_agent"
        )


# ---------------------------------------------------------------------------
# 3. AuditMiddleware + _audit_identity — pure unit, no DB
# ---------------------------------------------------------------------------

def _scope(method: str, path: str, headers: dict[bytes, bytes] | None = None) -> dict:
    return {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(k, v) for k, v in (headers or {}).items()],
    }


async def _dummy_app(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok", "more_body": False})


async def _noop_receive():
    return {"type": "http.request", "body": b"", "more_body": False}


class TestAuditIdentity:
    def test_valid_jwt_yields_sub_and_client_id(self):
        from app.main import _audit_identity

        user_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        token = jwt.encode(
            {"sub": user_id, "client_id": client_id},
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        actor, cid = _audit_identity(_scope("GET", "/insights/latest", {b"authorization": f"Bearer {token}".encode()}))
        assert actor == user_id
        assert cid == client_id

    def test_n8n_secret_header_yields_n8n_actor(self):
        from app.main import _audit_identity

        actor, cid = _audit_identity(
            _scope("POST", "/api/ingest/trigger", {b"x-n8n-webhook-secret": b"whatever"})
        )
        assert actor == "n8n"
        assert cid is None

    def test_anonymous_and_garbage_token_yield_none(self):
        from app.main import _audit_identity

        assert _audit_identity(_scope("GET", "/insights/latest")) == (None, None)
        assert _audit_identity(
            _scope("GET", "/insights/latest", {b"authorization": b"Bearer not.a.jwt"})
        ) == (None, None)


class TestAuditMiddleware:
    async def test_records_non_exempt_request(self, monkeypatch):
        from app.main import AuditMiddleware

        calls: list[tuple] = []

        async def _spy(action, **kwargs):
            calls.append((action, kwargs))

        monkeypatch.setattr("app.main.record_audit", _spy)

        mw = AuditMiddleware(_dummy_app)
        sent: list[dict] = []

        async def _send(msg):
            sent.append(msg)

        await mw(_scope("GET", "/insights/latest"), _noop_receive, _send)

        assert len(calls) == 1, "A non-exempt request must record exactly one audit row"
        action, kwargs = calls[0]
        assert action == "http.request"
        assert kwargs["resource"] == "GET /insights/latest"
        assert kwargs["detail"] == {"status": 200}
        assert any(m["type"] == "http.response.start" for m in sent), "Response must pass through"

    @pytest.mark.parametrize(
        "method,path",
        [
            ("GET", "/health"),
            ("GET", "/"),
            ("GET", "/docs"),
            ("OPTIONS", "/insights/latest"),  # CORS preflight
            ("GET", "/stream/insights"),       # SSE — exempt by prefix
        ],
    )
    async def test_skips_exempt_paths_and_methods(self, monkeypatch, method, path):
        from app.main import AuditMiddleware

        calls: list[tuple] = []

        async def _spy(*a, **k):
            calls.append((a, k))

        monkeypatch.setattr("app.main.record_audit", _spy)

        mw = AuditMiddleware(_dummy_app)

        async def _send(msg):
            pass

        await mw(_scope(method, path), _noop_receive, _send)
        assert calls == [], f"{method} {path} must not be audited"
