"""
GDPR erasure service (SR-04 — right to erasure / data minimisation).

Self-service: a tenant admin erases *their own* client via POST /api/clients/me/erase
(routers/ops.py). Cross-tenant erasure is impossible by construction — the endpoint only
ever passes current_user.client_id (CLAUDE.md §6); there is no client_id path parameter.

Posture: ERASE-AND-ANONYMISE rather than hard-delete of the tenant root. Personal data is
removed (users, raw feedback, journey events, data-source credentials, client-specific
embeddings, derived insights/reports); the tenant root and its audit_log rows are RETAINED
but anonymised, so the compliance record "this tenant existed and was erased" survives
(CLAUDE.md §14 complete audit trail). Full DSAR data-export is a documented residual.

This runs on a raw owner connection (bypasses RLS) because it is a privileged,
explicitly-audited admin action that must touch the append-only audit_log and the
non-tenant-scoped clients root. It is the only sanctioned write path that anonymises
audit_log; the gdpr.erasure event it emits afterwards records who ran it and when.
"""

from __future__ import annotations

import logging
from uuid import UUID

import app.database as _db
from app.services.audit_service import record_audit

logger = logging.getLogger("dataautomated")

# Tenant tables holding personal/derived data, deleted wholesale on erasure.
# Order matters: knowledge_embeddings first (its FK to clients has no cascade) and
# raw_feedback before data_sources (raw_feedback.source_id → data_sources is NO ACTION).
_DELETE_TABLES = [
    "knowledge_embeddings",  # client-specific RAG chunks
    "raw_feedback",          # raw customer text (PII)
    "journey_events",        # per-user behavioural events (user_id / session PII)
    "feedback_insights",     # derived narratives may quote PII
    "competitive_signals",
    "journey_insights",
    "reports",
    "data_sources",          # encrypted third-party credentials
    "users",                 # emails + password hashes
]


async def erase_client(client_id: UUID, *, requested_by: str) -> dict[str, int]:
    """
    Erase one tenant's personal data and anonymise its shell + audit trail.
    Returns per-table deleted-row counts. Raises RuntimeError if the pool is down.
    """
    if _db.pool is None:
        raise RuntimeError("Database pool is not initialized.")

    counts: dict[str, int] = {}
    async with _db.pool.acquire() as conn:
        async with conn.transaction():
            for table in _DELETE_TABLES:
                # Table names are hardcoded constants from _DELETE_TABLES, never user
                # input — the value is parameterised ($1).
                result = await conn.execute(
                    f"DELETE FROM {table} WHERE client_id = $1",  # nosec B608
                    client_id,
                )
                counts[table] = int(result.split()[-1]) if result else 0

            # Anonymise audit_log rows (retain the trail, drop the PII).
            await conn.execute(
                "UPDATE audit_log SET actor = 'erased', detail = '{}'::jsonb "
                "WHERE client_id = $1",
                client_id,
            )

            # Anonymise + deactivate the tenant root (retain a minimal shell).
            await conn.execute(
                "UPDATE clients SET name = 'ERASED', "
                "email = 'erased+' || id::text || '@deleted.invalid', "
                "api_key = NULL, is_active = FALSE WHERE id = $1",
                client_id,
            )

    # Record the erasure itself (client row still exists, now anonymised).
    await record_audit(
        "gdpr.erasure",
        client_id=client_id,
        actor=requested_by,
        resource="POST /api/clients/me/erase",
        detail={"deleted": counts},
    )
    logger.warning(
        '{"event": "gdpr.erasure", "client_id": "%s", "requested_by": "%s"}',
        client_id,
        requested_by,
    )
    return counts
