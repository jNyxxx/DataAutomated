"""
Database access layer — the SINGLE source of pooled, tenant-scoped connections
(DATABASE_FOUNDATION.md §6, MULTI_TENANT_SECURITY.md §4, BACKEND_ARCHITECTURE.md §5).

Runtime contract:
  - There is exactly ONE pool.  No ad-hoc asyncpg.connect() anywhere.
  - Every checkout that touches tenant data MUST go through acquire_for_client().
  - acquire_for_client() sets SET LOCAL ROLE app_runtime (makes RLS apply even on
    superuser connections — CLAUDE.md §2 "RLS is the first line of defence") and
    set_config('app.current_client_id', client_id, TRUE) (transaction-scoped; clears
    automatically when the transaction ends, so the pool connection is clean on return).
  - client_id MUST come from a trusted source — validated JWT claim or an explicit
    server-controlled dispatch argument (CLAUDE.md §6).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID

import asyncpg

from app.config import settings

# Module-level pool — populated by init_pool(), torn down by close_pool().
pool: Optional[asyncpg.Pool] = None


async def init_pool(dsn: Optional[str] = None) -> None:
    """
    Create the shared asyncpg pool.

    dsn: override the pool DSN (used by tests to pass TEST_DATABASE_DSN without
         patching settings).  Production always uses settings.database_dsn.
    """
    global pool
    pool = await asyncpg.create_pool(
        dsn or settings.database_dsn,
        min_size=2,
        max_size=10,
    )


async def close_pool() -> None:
    """Gracefully drain and close the shared pool on shutdown."""
    global pool
    if pool is not None:
        await pool.close()
        pool = None


@asynccontextmanager
async def acquire_for_client(client_id: UUID):
    """
    Check out a pooled connection scoped to client_id.

    The ONLY sanctioned path for tenant data access — agents, tools, and request
    handlers MUST use this context manager.

    Inside the context:
      - Role is app_runtime (non-superuser, non-BYPASSRLS → RLS applies).
      - app.current_client_id is set transaction-locally to str(client_id).
      - An explicit transaction wraps the block; both role and setting revert
        automatically when the transaction commits or rolls back.

    Deviation from the plan's skeleton: SET LOCAL ROLE app_runtime is added here
    (not in the original plan stub) because CLAUDE.md §2 requires RLS as the
    first line of defence — superuser connections bypass RLS even with FORCE.
    Flagged for review; remove only if the pool is reconfigured to connect as
    a non-superuser role natively.
    """
    if pool is None:
        raise RuntimeError("Database pool is not initialized.")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SET LOCAL ROLE app_runtime")
            await conn.fetchval(
                "SELECT set_config('app.current_client_id', $1, TRUE)",
                str(client_id),
            )
            yield conn
