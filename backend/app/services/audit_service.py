"""
Audit trail service (CLAUDE.md §14 — "complete audit trail for all data access
and AI agent actions").

record_audit() is the single write path to audit_log:
  - client-scoped events go through acquire_for_client (RLS context + explicit
    client_id, §6); system events (client_id=None) use a raw pool checkout and
    satisfy the NULL branch of the audit_insert policy.
  - NEVER raises: an audit-write failure must not fail the request or agent run
    it describes — failures are logged at WARNING on the "dataautomated" logger
    (which also feeds CloudWatch in production), so a broken trail is visible.
  - audit_log is append-only under app_runtime (no UPDATE/DELETE policy).

Action vocabulary (VARCHAR(100), documented per §5 convention):
  http.request   — any authenticated/internal API call (recorded by middleware)
  auth.login     — successful login            auth.failure — rejected login
  agent.store    — an agent persisted results  ingest.run   — ingestion pipeline run
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

import app.database as _db
from app.database import acquire_for_client

logger = logging.getLogger("dataautomated")

_INSERT = (
    "INSERT INTO audit_log (client_id, actor, action, resource, detail) "
    "VALUES ($1, $2, $3, $4, $5::jsonb)"
)


async def record_audit(
    action: str,
    *,
    client_id: UUID | None = None,
    actor: str | None = None,
    resource: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Append one audit_log row. Best-effort: logs (never raises) on failure."""
    try:
        if _db.pool is None:
            return  # pool not initialized (startup/tests without DB) — nothing to write to
        detail_json = json.dumps(detail or {})
        if client_id is not None:
            async with acquire_for_client(client_id) as conn:
                await conn.execute(_INSERT, client_id, actor, action, resource, detail_json)
        else:
            async with _db.pool.acquire() as conn:
                await conn.execute(_INSERT, None, actor, action, resource, detail_json)
    except Exception as exc:
        logger.warning(
            '{"event": "audit.write_failed", "action": "%s", "error": "%s"}',
            action,
            str(exc),
        )
