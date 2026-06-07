"""
Journey Analytics router (CLAUDE.md §10; prefix `/journeys`, tag `Journey Analytics`).

Routes:
  POST /journeys/analyze    — dispatch Journey agent (async)
  GET  /journeys/latest     — latest journey_insights rows for the caller's client
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/journeys", tags=["Journey Analytics"])


async def _run_journey_analysis(client_id: UUID) -> None:
    """Placeholder — Phase 4 wires journey_agent here."""
    pass


@router.post("/analyze", status_code=202, summary="Trigger Journey analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    background_tasks.add_task(_run_journey_analysis, client_id=current_user.client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "journey", "client_id": "%s"}',
        current_user.client_id,
    )
    return {"status": "analysis_queued", "message": "Journey analysis dispatched."}


@router.get("/latest", summary="Latest journey insights for the caller's client")
async def latest(current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the 20 most recent journey_insights rows for the caller's client.
    acquire_for_client sets RLS context; explicit WHERE provides belt-and-suspenders
    isolation per CLAUDE.md §6.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            "SELECT id, funnel_step, drop_off_rate, friction_score, "
            "       friction_cause, recommendation, projected_lift, created_at "
            "FROM journey_insights "
            "WHERE client_id = $1 "
            "ORDER BY created_at DESC LIMIT 20",
            current_user.client_id,
        )
    return {
        "insights": [
            {k: str(v) if v is not None else None for k, v in dict(r).items()}
            for r in rows
        ]
    }
