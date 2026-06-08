"""
VoC Insights router (CLAUDE.md §10; prefix `/insights`, tag `VoC Insights`).

Routes:
  POST /insights/analyze          — dispatch VoC agent (background, < 100ms)
  GET  /insights/latest           — latest feedback_insights row for the caller's client
  GET  /stream/insights           — SSE stream; 5s server-side poll (CLAUDE.md §12)
  POST /api/agents/voc/run        — n8n alias for /insights/analyze
  POST /api/ingest/trigger        — n8n ingest trigger (stub; Phase 4 wires the agent body)

All read endpoints use acquire_for_client (RLS + explicit WHERE) per CLAUDE.md §6.
No agent run may block an HTTP request (CLAUDE.md §10 background task rule).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import CurrentUser, get_current_user

logger = logging.getLogger("dataautomated")

# Primary router — prefix /insights
router = APIRouter(prefix="/insights", tags=["VoC Insights"])

# Secondary router (no prefix) — for paths that must start with /api/ or /stream/
_extra = APIRouter(tags=["VoC Insights"])


# ---------------------------------------------------------------------------
# Background dispatch — wires to the real VoC LangGraph agent (Phase 4a)
# ---------------------------------------------------------------------------

async def _run_voc_analysis(client_id: UUID) -> None:
    """Dispatch the VoC LangGraph agent. Background tasks must not propagate exceptions."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; VoC agent skipped for client %s", client_id)
        return
    try:
        from app.agents.voc_agent import run_voc_analysis
        await run_voc_analysis(client_id)
    except Exception:
        logger.exception("VoC agent run failed for client %s", client_id)


# ---------------------------------------------------------------------------
# /insights/analyze  +  n8n alias /api/agents/voc/run
# ---------------------------------------------------------------------------

async def _dispatch_voc(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
):
    """Shared handler for analyze + n8n alias — enqueues and returns 202 immediately."""
    background_tasks.add_task(_run_voc_analysis, client_id=current_user.client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "voc", "client_id": "%s"}',
        current_user.client_id,
    )
    return {"status": "analysis_queued", "message": "VoC analysis dispatched."}


@router.post("/analyze", status_code=202, summary="Trigger VoC analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await _dispatch_voc(background_tasks, current_user)


# ---------------------------------------------------------------------------
# /insights/latest
# ---------------------------------------------------------------------------

@router.get("/latest", summary="Latest VoC insight for the caller's client")
async def latest(current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the most recent feedback_insights row.
    Uses acquire_for_client (RLS + explicit WHERE — belt and suspenders per CLAUDE.md §6).
    """
    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, sentiment_score, sentiment_label, urgency_score, "
            "       themes, narrative, churn_risk, period_start, period_end, created_at "
            "FROM feedback_insights "
            "WHERE client_id = $1 "
            "ORDER BY created_at DESC LIMIT 1",
            current_user.client_id,
        )
    if row is None:
        return {"insight": None}
    return {"insight": {k: str(v) if v is not None else None for k, v in dict(row).items()}}


# ---------------------------------------------------------------------------
# /stream/insights — SSE (CLAUDE.md §12)
# ---------------------------------------------------------------------------

@_extra.get("/stream/insights", summary="SSE stream of new VoC insights")
async def stream_insights(current_user: CurrentUser = Depends(get_current_user)):
    """
    Server-Sent Events stream.  Polls feedback_insights every 5 seconds and pushes
    new rows as they appear.  Client closes the EventSource to stop receiving.
    """
    async def _generator():
        last_id: Optional[UUID] = None
        while True:
            async with acquire_for_client(current_user.client_id) as conn:
                if last_id is None:
                    row = await conn.fetchrow(
                        "SELECT id, narrative, churn_risk, created_at "
                        "FROM feedback_insights "
                        "WHERE client_id = $1 "
                        "ORDER BY created_at DESC LIMIT 1",
                        current_user.client_id,
                    )
                else:
                    row = await conn.fetchrow(
                        "SELECT id, narrative, churn_risk, created_at "
                        "FROM feedback_insights "
                        "WHERE client_id = $1 AND id != $2 "
                        "ORDER BY created_at DESC LIMIT 1",
                        current_user.client_id, last_id,
                    )
            if row:
                row_id = row["id"]
                if row_id != last_id:
                    last_id = row_id
                    payload = {k: str(v) if v is not None else None for k, v in dict(row).items()}
                    yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# n8n-facing routes (absolute paths — included via main.py extra router)
# ---------------------------------------------------------------------------

@_extra.post("/api/agents/voc/run", status_code=202, summary="[n8n] Trigger VoC agent")
async def n8n_voc_run(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await _dispatch_voc(background_tasks, current_user)


@_extra.post("/api/ingest/trigger", status_code=202, summary="[n8n] Trigger data ingestion")
async def n8n_ingest_trigger(current_user: CurrentUser = Depends(get_current_user)):
    """Stub — Phase 4 wires the MCP tool ingestion pipeline here."""
    logger.info(
        '{"event": "dispatch.queued", "agent": "ingest", "client_id": "%s"}',
        current_user.client_id,
    )
    return {"status": "ingestion_queued", "ingestion_count": 0}
