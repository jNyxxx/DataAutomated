"""
Competitive Signals router (CLAUDE.md §10; prefix `/signals`, tag `Competitive Signals`).

Routes:
  POST /signals/analyze                       — dispatch Competitive Signal agent (async)
  GET  /signals/latest                        — latest competitive_signals rows
  POST /api/agents/competitive-signal/run     — n8n alias for /signals/analyze
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/signals", tags=["Competitive Signals"])
_extra = APIRouter(tags=["Competitive Signals"])


async def _run_comp_signal_analysis(client_id: UUID) -> None:
    """Placeholder — Phase 4 wires comp_signal_agent here."""
    pass


async def _dispatch_comp_signal(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
):
    background_tasks.add_task(_run_comp_signal_analysis, client_id=current_user.client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "comp_signal", "client_id": "%s"}',
        current_user.client_id,
    )
    return {"status": "analysis_queued", "message": "Competitive signal analysis dispatched."}


@router.post("/analyze", status_code=202, summary="Trigger Competitive Signal analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await _dispatch_comp_signal(background_tasks, current_user)


@router.get("/latest", summary="Latest competitive signals for the caller's client")
async def latest(current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the 20 most recent competitive_signals rows for the caller's client.
    acquire_for_client sets RLS context; explicit WHERE provides belt-and-suspenders
    isolation per CLAUDE.md §6.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            "SELECT id, competitor_name, signal_type, signal_source, "
            "       strategic_context, urgency, detected_at, is_read "
            "FROM competitive_signals "
            "WHERE client_id = $1 "
            "ORDER BY detected_at DESC LIMIT 20",
            current_user.client_id,
        )
    return {
        "signals": [
            {k: str(v) if v is not None else None for k, v in dict(r).items()}
            for r in rows
        ]
    }


@_extra.post(
    "/api/agents/competitive-signal/run",
    status_code=202,
    summary="[n8n] Trigger Competitive Signal agent",
)
async def n8n_comp_signal_run(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await _dispatch_comp_signal(background_tasks, current_user)
