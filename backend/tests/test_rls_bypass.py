"""
P4-05 — automated RLS-bypass detection.

The systemic isolation guarantee (M1): the runtime DB role must NEVER be able to bypass
Row-Level Security, so that even a forgotten `acquire_for_client` helper (a raw
`pool.acquire()` against a tenant table) cannot read across tenants. These tests assert
the role attributes that make that guarantee hold, and that migration 0005's `app_login`
role (the LOGIN role ops can cut the pool over to) is equally safe.

Requires: running DB + `alembic upgrade head` (through 0005). Skips if DB unreachable.
"""

from __future__ import annotations

import asyncpg


class TestRoleCannotBypassRLS:
    async def test_app_runtime_attributes(self, admin_conn: asyncpg.Connection):
        """app_runtime must be non-superuser, non-BYPASSRLS, and NOLOGIN."""
        row = await admin_conn.fetchrow(
            "SELECT rolsuper, rolbypassrls, rolcanlogin "
            "FROM pg_roles WHERE rolname = 'app_runtime'"
        )
        assert row is not None, "app_runtime role must exist (migration 0001)"
        assert row["rolsuper"] is False, "app_runtime must NOT be a superuser"
        assert row["rolbypassrls"] is False, "app_runtime must NOT bypass RLS"
        assert row["rolcanlogin"] is False, "app_runtime is reached via SET ROLE only"

    async def test_app_login_attributes(self, admin_conn: asyncpg.Connection):
        """app_login (M1) must be a LOGIN role that still cannot bypass RLS."""
        row = await admin_conn.fetchrow(
            "SELECT rolsuper, rolbypassrls, rolcanlogin "
            "FROM pg_roles WHERE rolname = 'app_login'"
        )
        assert row is not None, "app_login role must exist (migration 0005)"
        assert row["rolsuper"] is False, "app_login must NOT be a superuser"
        assert row["rolbypassrls"] is False, "app_login must NOT bypass RLS"
        assert row["rolcanlogin"] is True, "app_login is the pool's intended LOGIN role"

    async def test_app_login_can_assume_app_runtime(self, admin_conn: asyncpg.Connection):
        """app_login must be a member of app_runtime so SET LOCAL ROLE works."""
        is_member = await admin_conn.fetchval(
            "SELECT pg_has_role('app_login', 'app_runtime', 'MEMBER')"
        )
        assert is_member is True, "app_login must inherit app_runtime privileges"

    async def test_app_runtime_select_without_context_is_empty(
        self, tx_conn: asyncpg.Connection
    ):
        """
        Regression for the M1 scenario: a checkout that reaches a tenant table as
        app_runtime WITHOUT setting app.current_client_id sees nothing — RLS is the
        backstop even when the developer forgets the tenant filter entirely.
        """
        cid = await tx_conn.fetchval(
            "INSERT INTO clients (name, email) VALUES ('Bypass Co', 'bypass@rls-test.com') "
            "RETURNING id;"
        )
        await tx_conn.execute(
            "INSERT INTO raw_feedback (client_id, content) VALUES ($1, 'secret');", cid
        )

        # Switch to the runtime role but set NO tenant context.
        await tx_conn.execute("SET LOCAL ROLE app_runtime;")
        rows = await tx_conn.fetch("SELECT * FROM raw_feedback;")
        assert rows == [], "Without context, app_runtime must read zero tenant rows"
