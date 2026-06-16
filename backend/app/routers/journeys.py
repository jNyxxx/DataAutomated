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

import datetime as _dt
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user, require_role

logger = logging.getLogger("dataautomated")


def _row_dict(row) -> dict:
    """Convert asyncpg Record to JSON-safe dict: ISO-8601 datetimes, UUIDs as str, numerics unchanged."""
    result = {}
    for k, v in dict(row).items():
        if v is None:
            result[k] = None
        elif isinstance(v, (_dt.datetime, _dt.date)):
            result[k] = v.isoformat()
        elif isinstance(v, UUID):
            result[k] = str(v)
        else:
            result[k] = v
    return result


router = APIRouter(prefix="/journeys", tags=["Journey Analytics"])


async def _run_journey_analysis(client_id: UUID) -> None:
    """Dispatch the Journey LangGraph agent with job lifecycle tracking."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; Journey agent skipped for client %s", client_id)
        return
    from app.services.job_service import run_tracked
    from app.agents.journey_agent import run_journey_analysis
    await run_tracked(client_id, "journey", run_journey_analysis(client_id))


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
        # Count distinct funnel steps — raw row count would include duplicates from
        # multiple agent runs before the DELETE-before-INSERT fix is in effect.
        total = await conn.fetchval(
            "SELECT COUNT(DISTINCT funnel_step) FROM journey_insights WHERE client_id = $1",
            current_user.client_id,
        )
        # DISTINCT ON keeps the most-recent row per funnel_step, then the outer query
        # re-sorts by recency and applies pagination.
        rows = await conn.fetch(
            "SELECT id, funnel_step, drop_off_rate, friction_score, "
            "       friction_cause, recommendation, projected_lift, created_at "
            "FROM ("
            "    SELECT DISTINCT ON (funnel_step) "
            "        id, funnel_step, drop_off_rate, friction_score, "
            "        friction_cause, recommendation, projected_lift, created_at "
            "    FROM journey_insights "
            "    WHERE client_id = $1 "
            "    ORDER BY funnel_step, created_at DESC"
            ") latest_per_step "
            "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            current_user.client_id,
            limit,
            offset,
        )
    return {
        "insights": [_row_dict(r) for r in rows],
        "total": total,
    }


@router.get("/device-breakdown", summary="Device breakdown from journey events (30d)")
async def device_breakdown(current_user: CurrentUser = Depends(get_current_user)):
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            "SELECT COALESCE(properties->>'device', 'unknown') AS device, "
            "COUNT(*)::int AS count "
            "FROM journey_events "
            "WHERE client_id = $1 "
            "AND occurred_at >= NOW() - INTERVAL '30 days' "
            "GROUP BY 1 "
            "ORDER BY 2 DESC, 1 ASC",
            current_user.client_id,
        )

    total = sum(row["count"] for row in rows)
    if total <= 0:
        return {"devices": []}

    return {
        "devices": [
            {
                "device": row["device"],
                "count": row["count"],
                "pct": round(row["count"] / total * 100),
            }
            for row in rows
        ]
    }


@router.get("/{journey_id}", summary="Get a specific journey insight by ID")
async def get_journey_by_id(
    journey_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Returns a specific journey insight ensuring tenant isolation."""
    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, funnel_step, drop_off_rate, friction_score, "
            "       friction_cause, recommendation, projected_lift, created_at "
            "FROM journey_insights "
            "WHERE id = $1 AND client_id = $2",
            journey_id,
            current_user.client_id,
        )
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Journey insight not found")
        
    return _row_dict(row)
