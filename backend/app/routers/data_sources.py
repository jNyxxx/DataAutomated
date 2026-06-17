"""
Data-source CRUD + connection lifecycle (CLAUDE.md §8, §10, §14).

GET    /api/data-sources              — list connected sources (no credentials returned)
POST   /api/data-sources              — add a source; require_role("admin")
PATCH  /api/data-sources/{id}         — update credentials/config; require_role("admin")
POST   /api/data-sources/{id}/test    — validate credentials and set connection_status
DELETE /api/data-sources/{id}         — hard-delete; require_role("admin")

Connection state machine:
  pending_configuration → [test] → active
  pending_configuration → [test] → failed
  failed               → [test] → active
  active               → [update creds] → pending_configuration
  active               → [delete] → (removed)
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user, require_role

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


async def _auto_ingest_and_analyze(client_id: UUID) -> None:
    """
    Run the MCP ingestion pipeline then the VoC agent as a background task
    after a source is connected or its credentials are updated.
    Mirrors the n8n Workflow 1 chain (ingest → if count > 0 → VoC agent).
    Exceptions are swallowed — the HTTP response must never depend on this.
    """
    try:
        from app.services.ingestion_service import run_ingestion
        result = await run_ingestion(client_id)
        ingestion_count = result.get("ingestion_count", 0)
        logger.info(
            '{"event":"datasource.auto_ingest","client_id":"%s","ingestion_count":%d}',
            client_id, ingestion_count,
        )
        if ingestion_count > 0 and settings.openai_api_key:
            from app.agents.voc_agent import run_voc_analysis
            await run_voc_analysis(client_id)
    except Exception:
        logger.exception("_auto_ingest_and_analyze failed for client %s", client_id)


@router.get("/api/data-sources")
async def list_data_sources(current_user: CurrentUser = Depends(get_current_user)):
    """Returns data sources connected by the authenticated client. Credentials are never returned."""
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            """SELECT id, source_type, is_active, last_synced_at, created_at,
                      connection_status, connection_error
               FROM data_sources WHERE client_id = $1 ORDER BY created_at ASC""",
            current_user.client_id,
        )
    return {
        "sources": [
            {
                "id": str(r["id"]),
                "source_type": r["source_type"],
                "is_active": r["is_active"],
                "last_synced_at": str(r["last_synced_at"]) if r["last_synced_at"] else None,
                "created_at": str(r["created_at"]),
                "connection_status": r["connection_status"] or "pending_configuration",
                "connection_error": r["connection_error"],
            }
            for r in rows
        ]
    }


@router.post("/api/data-sources", status_code=201)
async def add_data_source(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Add a new data source. Sets connection_status = 'pending_configuration'.
    Triggers auto-ingest as a background task (credentials can be added via PATCH).
    """
    import uuid as _uuid

    from app.services.credential_encryption import encrypt_credentials

    source_type = payload.get("source_type", "").strip()
    raw_credentials = payload.get("credentials", {})
    config = payload.get("config", {})

    if not source_type:
        raise HTTPException(status_code=422, detail="source_type is required")

    async with acquire_for_client(current_user.client_id) as conn:
        existing = await conn.fetchval(
            """SELECT id FROM data_sources
               WHERE client_id = $1 AND source_type = $2 AND is_active = TRUE
               LIMIT 1""",
            current_user.client_id,
            source_type,
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"A '{source_type}' source is already connected. "
                       "Disconnect it before adding another.",
            )

        encrypted = encrypt_credentials(raw_credentials) if raw_credentials else {}
        new_id = _uuid.uuid4()
        # Sources with no credentials (public scrapers) start active immediately
        from app.services.connection_validator import NO_CREDS_SOURCES
        initial_status = "active" if source_type in NO_CREDS_SOURCES else "pending_configuration"
        await conn.execute(
            """INSERT INTO data_sources
                 (id, client_id, source_type, credentials, config, is_active,
                  connection_status, created_at)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, TRUE, $6, NOW())""",
            new_id,
            current_user.client_id,
            source_type,
            json.dumps(encrypted),
            json.dumps(config),
            initial_status,
        )

    if initial_status == "active":
        background_tasks.add_task(_auto_ingest_and_analyze, client_id=current_user.client_id)

    logger.info(
        '{"event":"datasource.created","source_id":"%s","source_type":"%s","client_id":"%s","status":"%s"}',
        new_id, source_type, current_user.client_id, initial_status,
    )
    return {"id": str(new_id), "source_type": source_type, "connection_status": initial_status}


@router.patch("/api/data-sources/{source_id}")
async def update_data_source(
    source_id: str,
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Update credentials/config. Updating credentials resets connection_status to
    'pending_configuration' — the user must re-run Test Connection to activate.
    """
    import uuid as _uuid

    from app.services.credential_encryption import encrypt_credentials

    is_active = payload.get("is_active")
    raw_credentials = payload.get("credentials")
    config = payload.get("config")

    if is_active is None and raw_credentials is None and config is None:
        raise HTTPException(
            status_code=422,
            detail="At least one of is_active, credentials, or config is required.",
        )

    try:
        source_uuid = _uuid.UUID(source_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Data source not found.")

    set_clauses: list[str] = []
    values: list[Any] = []

    if is_active is not None:
        values.append(bool(is_active))
        set_clauses.append(f"is_active = ${len(values)}")
        if not bool(is_active):
            values.append("disconnected")
            set_clauses.append(f"connection_status = ${len(values)}")
    if raw_credentials is not None:
        values.append(json.dumps(encrypt_credentials(raw_credentials)))
        set_clauses.append(f"credentials = ${len(values)}::jsonb")
        # Credentials changed — require re-test before marking active
        values.append("pending_configuration")
        set_clauses.append(f"connection_status = ${len(values)}")
        values.append(None)
        set_clauses.append(f"connection_error = ${len(values)}")
    if config is not None:
        values.append(json.dumps(config))
        set_clauses.append(f"config = ${len(values)}::jsonb")

    values.append(source_uuid)
    values.append(current_user.client_id)
    pk_idx = len(values) - 1
    cid_idx = len(values)

    async with acquire_for_client(current_user.client_id) as conn:
        result = await conn.execute(
            f"UPDATE data_sources SET {', '.join(set_clauses)} "
            f"WHERE id = ${pk_idx} AND client_id = ${cid_idx}",
            *values,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Data source not found.")

    credentials_updated = raw_credentials is not None
    being_activated = is_active is True
    if credentials_updated or being_activated:
        background_tasks.add_task(_auto_ingest_and_analyze, client_id=current_user.client_id)

    return {"status": "updated"}


@router.post("/api/data-sources/{source_id}/test", status_code=200)
async def test_data_source_connection(
    source_id: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Live-validate credentials against the real external API and transition
    connection_status:
      pending_configuration | failed  →  active   (API accepted the credentials)
                                       →  failed   (API rejected or credentials incomplete)

    Each source type has a dedicated validator in connection_validator.py that makes
    a real lightweight API call and returns a specific human-readable error on failure.
    """
    import uuid as _uuid
    import json as _json
    from app.services.credential_encryption import decrypt_credentials
    from app.services.connection_validator import validate_connection

    try:
        source_uuid = _uuid.UUID(source_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Data source not found.")

    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            """SELECT id, source_type, credentials, config
               FROM data_sources
               WHERE id = $1 AND client_id = $2""",
            source_uuid,
            current_user.client_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Data source not found.")

        source_type = row["source_type"]

        # Decrypt stored credentials
        # asyncpg may return JSONB as a string or dict depending on version/codec
        raw_creds = row["credentials"]
        if isinstance(raw_creds, str):
            raw_creds = _json.loads(raw_creds) if raw_creds else {}
        encrypted = raw_creds or {}
        try:
            creds = decrypt_credentials(encrypted) if encrypted else {}
        except Exception:
            error_msg = "Could not decrypt stored credentials — please re-enter them."
            await conn.execute(
                """UPDATE data_sources
                   SET connection_status = 'failed', connection_error = $1
                   WHERE id = $2 AND client_id = $3""",
                error_msg, source_uuid, current_user.client_id,
            )
            return {"connection_status": "failed", "error": error_msg}

        # Decrypt config (for sources like competitor_monitor that use it)
        raw_config = row["config"]
        if isinstance(raw_config, str):
            raw_config = _json.loads(raw_config) if raw_config else {}
        config = raw_config or {}

        # Live API validation
        ok, error_msg = await validate_connection(source_type, creds, config)

        if ok:
            await conn.execute(
                """UPDATE data_sources
                   SET connection_status = 'active', connection_error = NULL
                   WHERE id = $1 AND client_id = $2""",
                source_uuid, current_user.client_id,
            )
            background_tasks.add_task(_auto_ingest_and_analyze, client_id=current_user.client_id)
            logger.info(
                '{"event":"datasource.test.pass","source_id":"%s","source_type":"%s"}',
                source_id, source_type,
            )
            return {"connection_status": "active", "message": "Connection validated successfully."}
        else:
            await conn.execute(
                """UPDATE data_sources
                   SET connection_status = 'failed', connection_error = $1
                   WHERE id = $2 AND client_id = $3""",
                error_msg, source_uuid, current_user.client_id,
            )
            logger.info(
                '{"event":"datasource.test.fail","source_id":"%s","source_type":"%s","error":"%s"}',
                source_id, source_type, error_msg,
            )
            return {"connection_status": "failed", "error": error_msg}


@router.delete("/api/data-sources/{source_id}", status_code=200)
async def delete_data_source(
    source_id: str,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Hard-delete a data source and its encrypted credentials.
    Belt-and-suspenders: both RLS and explicit WHERE client_id prevent cross-tenant deletes.
    """
    import uuid as _uuid

    try:
        source_uuid = _uuid.UUID(source_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Data source not found.")

    async with acquire_for_client(current_user.client_id) as conn:
        # Delete related raw_feedback to prevent foreign key violation
        await conn.execute(
            "DELETE FROM raw_feedback WHERE source_id = $1 AND client_id = $2",
            source_uuid,
            current_user.client_id,
        )
        
        result = await conn.execute(
            "DELETE FROM data_sources WHERE id = $1 AND client_id = $2",
            source_uuid,
            current_user.client_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Data source not found.")

    logger.info(
        '{"event":"datasource.deleted","source_id":"%s","client_id":"%s"}',
        source_id, current_user.client_id,
    )
    return {"status": "disconnected"}
