"""
Competitive Signals router (CLAUDE.md §10; prefix `/signals`, tag `Competitive Signals`).

Routes:
  POST /signals/analyze                       — dispatch Competitive Signal agent (async)
  GET  /signals/latest                        — paginated competitive_signals rows
  GET  /signals/{signal_id}                   — single signal by ID
  PATCH /signals/{signal_id}/read             — mark a signal as read
  POST /api/agents/competitive-signal/run     — n8n alias for /signals/analyze
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import (
    CurrentUser,
    get_current_user,
    require_role,
    resolve_service_client,
    verify_n8n_secret,
)

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/signals", tags=["Competitive Signals"])
_extra = APIRouter(tags=["Competitive Signals"])


async def _run_comp_signal_analysis(client_id: UUID) -> None:
    """Dispatch the Competitive Signal LangGraph agent. Background tasks must not propagate exceptions."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; CompSig agent skipped for client %s", client_id)
        return
    try:
        from app.agents.comp_signal_agent import run_comp_signal_analysis
        await run_comp_signal_analysis(client_id)
    except Exception:
        logger.exception("CompSig agent run failed for client %s", client_id)


async def _dispatch_comp_signal(
    background_tasks: BackgroundTasks,
    client_id: UUID,
):
    background_tasks.add_task(_run_comp_signal_analysis, client_id=client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "comp_signal", "client_id": "%s"}',
        client_id,
    )
    return {"status": "analysis_queued", "message": "Competitive signal analysis dispatched."}


@router.post("/analyze", status_code=202, summary="Trigger Competitive Signal analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin", "analyst")),
):
    return await _dispatch_comp_signal(background_tasks, current_user.client_id)


@router.get("/latest", summary="Latest competitive signals for the caller's client")
async def latest(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns paginated competitive_signals rows for the caller's client.
    acquire_for_client sets RLS context; explicit WHERE provides belt-and-suspenders
    isolation per CLAUDE.md §6.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals WHERE client_id = $1",
            current_user.client_id,
        )
        rows = await conn.fetch(
            "SELECT id, competitor_name, signal_type, signal_source, "
            "       strategic_context, urgency, detected_at, is_read "
            "FROM competitive_signals "
            "WHERE client_id = $1 "
            "ORDER BY detected_at DESC LIMIT $2 OFFSET $3",
            current_user.client_id,
            limit,
            offset,
        )
    return {
        "signals": [
            {
                **{k: str(v) if v is not None and k != "is_read" else v
                   for k, v in dict(r).items()},
                "is_read": bool(r["is_read"]),
            }
            for r in rows
        ],
        "total": total,
    }


@router.get("/{signal_id}", summary="Single competitive signal by ID")
async def get_signal(
    signal_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    import uuid as _uuid
    try:
        signal_uuid = _uuid.UUID(signal_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Signal not found.")
    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, competitor_name, signal_type, signal_source, "
            "       strategic_context, urgency, detected_at, is_read "
            "FROM competitive_signals "
            "WHERE id = $1 AND client_id = $2",
            signal_uuid,
            current_user.client_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Signal not found.")
    return {
        "signal": {
            **{k: str(v) if v is not None and k != "is_read" else v
               for k, v in dict(row).items()},
            "is_read": bool(row["is_read"]),
        }
    }


@router.patch("/{signal_id}/read", summary="Mark a competitive signal as read")
async def mark_signal_read(
    signal_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    import uuid as _uuid
    try:
        signal_uuid = _uuid.UUID(signal_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Signal not found.")
    async with acquire_for_client(current_user.client_id) as conn:
        result = await conn.execute(
            "UPDATE competitive_signals SET is_read = TRUE "
            "WHERE id = $1 AND client_id = $2",
            signal_uuid,
            current_user.client_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Signal not found.")
    return {"status": "ok"}


@_extra.get(
    "/api/signals/latest-for-client",
    summary="[n8n] Latest signals for an explicit client",
)
async def n8n_latest_signals(
    client_id: str,
    x_n8n_webhook_secret: str | None = Header(default=None),
):
    """
    n8n Workflow 2 reads the freshest signals per client to route critical
    alerts (§13). Auth via X-N8N-Webhook-Secret; tenant scope comes from the
    validated explicit client_id (§6) — same shape as GET /signals/latest.
    """
    verify_n8n_secret(x_n8n_webhook_secret)
    resolved_client_id = await resolve_service_client(client_id)
    async with acquire_for_client(resolved_client_id) as conn:
        rows = await conn.fetch(
            "SELECT id, competitor_name, signal_type, signal_source, "
            "       strategic_context, urgency, detected_at, is_read "
            "FROM competitive_signals "
            "WHERE client_id = $1 "
            "ORDER BY detected_at DESC LIMIT 20",
            resolved_client_id,
        )
    return {
        "signals": [
            {
                **{k: str(v) if v is not None and k != "is_read" else v
                   for k, v in dict(r).items()},
                "is_read": bool(r["is_read"]),
            }
            for r in rows
        ]
    }


@_extra.post(
    "/api/agents/competitive-signal/run",
    status_code=202,
    summary="[n8n] Trigger Competitive Signal agent",
)
async def n8n_comp_signal_run(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    x_n8n_webhook_secret: str | None = Header(default=None),
):
    """
    n8n server-to-server trigger (CLAUDE.md §13): auth via X-N8N-Webhook-Secret;
    the workflow loops over clients and passes each client_id explicitly (§6).
    """
    verify_n8n_secret(x_n8n_webhook_secret)
    client_id = await resolve_service_client(payload.get("client_id"))
    return await _dispatch_comp_signal(background_tasks, client_id)
