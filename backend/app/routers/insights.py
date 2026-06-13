"""
VoC Insights router (CLAUDE.md §10; prefix `/insights`, tag `VoC Insights`).

Routes:
  POST /insights/analyze          — dispatch VoC agent (background, < 100ms)
  GET  /insights/latest           — latest feedback_insights row for the caller's client
  GET  /stream/insights           — SSE stream; 5s server-side poll (CLAUDE.md §12)
  POST /api/agents/voc/run        — n8n alias for /insights/analyze
  POST /api/ingest/trigger        — n8n ingest trigger (runs the MCP ingestion pipeline)

All read endpoints use acquire_for_client (RLS + explicit WHERE) per CLAUDE.md §6.
No agent run may block an HTTP request (CLAUDE.md §10 background task rule).
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets as _secrets
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

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

# Primary router — prefix /insights
router = APIRouter(prefix="/insights", tags=["VoC Insights"])

# Secondary router (no prefix) — for paths that must start with /api/ or /stream/
_extra = APIRouter(tags=["VoC Insights"])

# ---------------------------------------------------------------------------
# SSE ticket store — short-lived single-use tokens so the long-lived JWT
# never appears in server access logs (CLAUDE.md §14 / §12 security note).
# In-memory dict is fine for a single-process deployment; for multi-replica
# ECS (2+ tasks without sticky sessions) replace with a DB-backed or Redis
# ticket store. TTL: 60 s — enough for a page load to open the EventSource.
# ---------------------------------------------------------------------------
_SSE_TICKETS: dict[str, tuple[UUID, float]] = {}  # ticket → (client_id, expiry_monotonic)
_SSE_TICKET_TTL = 60


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
    client_id: UUID,
):
    """Shared handler for analyze + n8n alias — enqueues and returns 202 immediately."""
    background_tasks.add_task(_run_voc_analysis, client_id=client_id)
    logger.info(
        '{"event": "dispatch.queued", "agent": "voc", "client_id": "%s"}',
        client_id,
    )
    return {"status": "analysis_queued", "message": "VoC analysis dispatched."}


@router.post("/analyze", status_code=202, summary="Trigger VoC analysis (async)")
async def analyze(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin", "analyst")),
):
    return await _dispatch_voc(background_tasks, current_user.client_id)


# ---------------------------------------------------------------------------
# /insights/latest
# ---------------------------------------------------------------------------

@router.get("/", summary="Paginated VoC insights list for the caller's client")
async def list_insights(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    async with acquire_for_client(current_user.client_id) as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights WHERE client_id = $1",
            current_user.client_id,
        )
        rows = await conn.fetch(
            "SELECT id, sentiment_score, sentiment_label, urgency_score, "
            "       themes, narrative, churn_risk, period_start, period_end, created_at "
            "FROM feedback_insights "
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
        "total": total or 0,
    }


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


@router.get("/{insight_id}", summary="Single VoC insight by ID")
async def get_insight(
    insight_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        insight_uuid = UUID(insight_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Insight not found.")
    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, sentiment_score, sentiment_label, urgency_score, "
            "       themes, narrative, churn_risk, period_start, period_end, created_at "
            "FROM feedback_insights "
            "WHERE client_id = $1 AND id = $2",
            current_user.client_id,
            insight_uuid,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Insight not found.")
    return {"insight": {k: str(v) if v is not None else None for k, v in dict(row).items()}}


# ---------------------------------------------------------------------------
# /stream/insights — SSE (CLAUDE.md §12)
# ---------------------------------------------------------------------------

async def _fetch_insights_since(conn, client_id: UUID, since) -> list:
    """
    Rows created strictly after the `since` watermark, oldest-first.

    The watermark is `created_at` (not the previously-emitted id): with an id
    watermark, once the newest row is emitted the query "latest row whose id is
    not the last one" returns the SECOND-newest (an old row) and the stream then
    oscillates between the two newest rows forever.  A monotonic created_at
    watermark only ever advances, so each row is emitted exactly once.
    """
    return await conn.fetch(
        "SELECT id, narrative, churn_risk, created_at "
        "FROM feedback_insights "
        "WHERE client_id = $1 AND created_at > $2 "
        "ORDER BY created_at ASC",
        client_id, since,
    )


async def _fetch_signals_since(conn, client_id: UUID, since) -> list:
    """Competitive signal rows detected strictly after the `since` watermark, oldest-first.
    competitive_signals uses detected_at (not created_at) as its primary timestamp."""
    return await conn.fetch(
        "SELECT id, competitor_name, signal_type, detected_at "
        "FROM competitive_signals "
        "WHERE client_id = $1 AND detected_at > $2 "
        "ORDER BY detected_at ASC",
        client_id, since,
    )


async def _fetch_journeys_since(conn, client_id: UUID, since) -> list:
    """Journey insight rows created strictly after the `since` watermark, oldest-first."""
    return await conn.fetch(
        "SELECT id, funnel_step, drop_off_rate, friction_cause, created_at "
        "FROM journey_insights "
        "WHERE client_id = $1 AND created_at > $2 "
        "ORDER BY created_at ASC",
        client_id, since,
    )


@_extra.post("/api/sse-ticket", status_code=200, summary="Issue a short-lived SSE access ticket")
async def issue_sse_ticket(current_user: CurrentUser = Depends(get_current_user)):
    """
    Exchange a JWT bearer token for a 60-second single-use ticket.
    The frontend should call this endpoint (with Authorization header) and then
    open EventSource using the returned ticket as a query param instead of the
    raw JWT — prevents the long-lived token from appearing in access logs (§14).
    """
    ticket = _secrets.token_urlsafe(32)
    _SSE_TICKETS[ticket] = (current_user.client_id, time.monotonic() + _SSE_TICKET_TTL)
    return {"ticket": ticket, "expires_in": _SSE_TICKET_TTL}


@_extra.get("/stream/insights", summary="SSE stream of new VoC insights")
async def stream_insights(
    ticket: str | None = Query(default=None, description="Short-lived ticket from POST /api/sse-ticket (preferred)"),
    token: str | None = Query(default=None, description="JWT bearer fallback — prefer ticket to avoid log leakage"),
):
    """
    Server-Sent Events stream (CLAUDE.md §12).  Polls feedback_insights every 5s
    and pushes rows created after connect.  Client closes the EventSource to stop.

    Auth: prefer POST /api/sse-ticket → use returned ticket here.  Raw JWT query
    param is accepted as a fallback but should not be used in production (token
    appears in access logs / proxies).  In same-origin CloudFront/ALB production
    a secure HttpOnly cookie is the ideal long-term approach.
    """
    if ticket is not None:
        entry = _SSE_TICKETS.pop(ticket, None)
        if entry is None or time.monotonic() > entry[1]:
            raise HTTPException(status_code=401, detail="SSE ticket invalid or expired.")
        client_id = entry[0]
    elif token is not None:
        current_user = await get_current_user(token)
        client_id = current_user.client_id
    else:
        raise HTTPException(status_code=401, detail="Authentication required.")

    async def _generator():
        # Seed per-table watermarks to "now" — prevents replaying existing rows.
        async with acquire_for_client(client_id) as conn:
            last_insight = await conn.fetchval(
                "SELECT COALESCE(MAX(created_at), NOW()) FROM feedback_insights WHERE client_id = $1",
                client_id,
            )
            last_signal = await conn.fetchval(
                "SELECT COALESCE(MAX(detected_at), NOW()) FROM competitive_signals WHERE client_id = $1",
                client_id,
            )
            last_journey = await conn.fetchval(
                "SELECT COALESCE(MAX(created_at), NOW()) FROM journey_insights WHERE client_id = $1",
                client_id,
            )
        while True:
            async with acquire_for_client(client_id) as conn:
                insight_rows = await _fetch_insights_since(conn, client_id, last_insight)
                signal_rows  = await _fetch_signals_since(conn, client_id, last_signal)
                journey_rows = await _fetch_journeys_since(conn, client_id, last_journey)
            for row in insight_rows:
                last_insight = row["created_at"]
                payload = {k: str(v) if v is not None else None for k, v in dict(row).items()}
                payload["event_type"] = "insight"
                yield f"data: {json.dumps(payload)}\n\n"
            for row in signal_rows:
                last_signal = row["detected_at"]
                payload = {k: str(v) if v is not None else None for k, v in dict(row).items()}
                payload["event_type"] = "signal"
                yield f"data: {json.dumps(payload)}\n\n"
            for row in journey_rows:
                last_journey = row["created_at"]
                payload = {k: str(v) if v is not None else None for k, v in dict(row).items()}
                payload["event_type"] = "journey"
                yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# n8n-facing routes (absolute paths — included via main.py extra router)
# ---------------------------------------------------------------------------

@_extra.post("/api/agents/voc/run", status_code=202, summary="[n8n] Trigger VoC agent")
async def n8n_voc_run(
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
    return await _dispatch_voc(background_tasks, client_id)


@_extra.post("/api/ingest/trigger", status_code=200, summary="[n8n] Trigger data ingestion")
async def n8n_ingest_trigger(
    payload: dict[str, Any],
    x_n8n_webhook_secret: str | None = Header(default=None),
):
    """
    Run the MCP-tool ingestion pipeline for the client named in the body.

    Auth: X-N8N-Webhook-Secret (server-to-server, §13) — n8n Workflow 1 loops
    over all active clients, so per-client JWTs cannot work here; the explicit
    client_id satisfies §6 and is validated against active clients.
    Synchronous by contract: n8n branches on the returned ingestion_count
    (> 0 → run the VoC agent), so the count must be real.
    Tool I/O only — no LangGraph agent runs on the request path (§2/§10).
    """
    from app.services.ingestion_service import run_ingestion

    verify_n8n_secret(x_n8n_webhook_secret)
    client_id = await resolve_service_client(payload.get("client_id"))
    result = await run_ingestion(client_id)
    return {"status": "ingestion_complete", **result}
