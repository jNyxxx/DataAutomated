"""
Journey Analytics router (CLAUDE.md §10; prefix `/journeys`, tag `Journey Analytics`).

Routes:
  POST /journeys/analyze    — dispatch Journey agent (async)
  GET  /journeys/latest     — paginated journey_insights rows for the caller's client

Note: unlike insights.py and signals.py, this router intentionally exposes NO `/api/agents/*/run`
n8n alias. CLAUDE.md §13 defines no scheduled n8n workflow for journey analysis (the four
workflows cover ingestion, competitive monitor, weekly report, and churn webhook), so adding a
journey trigger endpoint would be surface area with no consumer. Add one here if/when a §13
journey workflow is introduced.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user, require_role

logger = logging.getLogger("dataautomated")

router = APIRouter(prefix="/journeys", tags=["Journey Analytics"])


async def _run_journey_analysis(client_id: UUID) -> None:
    """Dispatch the Journey LangGraph agent. Background tasks must not propagate exceptions."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; Journey agent skipped for client %s", client_id)
        return
    try:
        from app.agents.journey_agent import run_journey_analysis
        await run_journey_analysis(client_id)
    except Exception:
        logger.exception("Journey agent run failed for client %s", client_id)


@router.post("/analyze", status_code=202, summary="Trigger Journey analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin", "analyst")),
):
    background_tasks.add_task(_run_journey_analysis, client_id=current_user.client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "journey", "client_id": "%s"}',
        current_user.client_id,
    )
    return {"status": "analysis_queued", "message": "Journey analysis dispatched."}


@router.get("/latest", summary="Latest journey insights for the caller's client")
async def latest(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns paginated journey_insights rows for the caller's client.
    acquire_for_client sets RLS context; explicit WHERE provides belt-and-suspenders
    isolation per CLAUDE.md §6.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM journey_insights WHERE client_id = $1",
            current_user.client_id,
        )
        rows = await conn.fetch(
            "SELECT id, funnel_step, drop_off_rate, friction_score, "
            "       friction_cause, recommendation, projected_lift, created_at "
            "FROM journey_insights "
            "WHERE client_id = $1 "
            "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            current_user.client_id,
            limit,
            offset,
        )
    return {
        "insights": [
            {k: str(v) if v is not None else None for k, v in dict(r).items()}
            for r in rows
        ],
        "total": total,
    }
