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
import datetime as _dt
import json
import logging
import secrets as _secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

import app.database as _db
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


def _row_dict(row) -> dict:
    """
    Convert an asyncpg Record to a JSON-safe dict with correct types.
    - datetimes → ISO 8601 string with T (not Python's space-separated repr)
    - UUIDs → str
    - booleans, ints, floats → kept as-is (NOT stringified)
    The blanket `str(v)` pattern breaks Safari's Date parser and returns
    numeric fields as strings instead of numbers.
    """
    result = {}
    for k, v in dict(row).items():
        if v is None:
            result[k] = None
        elif isinstance(v, (_dt.datetime, _dt.date)):
            result[k] = v.isoformat()
        elif isinstance(v, UUID):
            result[k] = str(v)
        else:
            result[k] = v  # int, float, bool, str — kept as-is
    return result


# Primary router — prefix /insights
router = APIRouter(prefix="/insights", tags=["VoC Insights"])

# Secondary router (no prefix) — for paths that must start with /api/ or /stream/
_extra = APIRouter(tags=["VoC Insights"])

# ---------------------------------------------------------------------------
# SSE ticket store — short-lived single-use tokens so the long-lived JWT
# never appears in server access logs (CLAUDE.md §14 / §12 security note).
# SR-02: stored in Postgres (sse_tickets), not process memory, so a ticket
# issued on one ECS task is redeemable on any task (no sticky sessions needed).
# TTL: 60 s — enough for a page load to open the EventSource.
# ---------------------------------------------------------------------------
_SSE_TICKET_TTL = 60


# ---------------------------------------------------------------------------
# Background dispatch — wires to the real VoC LangGraph agent (Phase 4a)
# ---------------------------------------------------------------------------

async def _run_voc_analysis(client_id: UUID) -> None:
    """Dispatch the VoC LangGraph agent with job lifecycle tracking."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; VoC agent skipped for client %s", client_id)
        return
    from app.services.job_service import run_tracked
    from app.agents.voc_agent import run_voc_analysis
    await run_tracked(client_id, "voc", run_voc_analysis(client_id))


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
        "insights": [_row_dict(r) for r in rows],
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
    return {"insight": _row_dict(row)}


@router.get("/feedback-samples", summary="Recent raw feedback samples for the caller's client")
async def feedback_samples(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the most recent raw_feedback rows for the authenticated client.
    Tenant-scoped via RLS + explicit WHERE (§6). Content is returned as-is;
    the UI truncates for display.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            "SELECT id, source_type, content, ingested_at "
            "FROM raw_feedback "
            "WHERE client_id = $1 AND source_type != 'custom' "
            "ORDER BY ingested_at DESC LIMIT $2",
            current_user.client_id,
            limit,
        )
    return {
        "samples": [
            {
                "id": str(r["id"]),
                "source_type": r["source_type"],
                "content": r["content"],
                "ingested_at": r["ingested_at"].isoformat() if r["ingested_at"] else None,
            }
            for r in rows
        ]
    }


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
    return {"insight": _row_dict(row)}


# ---------------------------------------------------------------------------
# /stream/insights — SSE (CLAUDE.md §12)
# ---------------------------------------------------------------------------




@_extra.post("/api/sse-ticket", status_code=200, summary="Issue a short-lived SSE access ticket")
async def issue_sse_ticket(current_user: CurrentUser = Depends(get_current_user)):
    """
    Exchange a JWT bearer token for a 60-second single-use ticket.
    The frontend should call this endpoint (with Authorization header) and then
    open EventSource using the returned ticket as a query param instead of the
    raw JWT — prevents the long-lived token from appearing in access logs (§14).
    """
    if _db.pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")
    ticket = _secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_SSE_TICKET_TTL)
    async with _db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sse_tickets (ticket, client_id, user_id, expires_at) "
            "VALUES ($1, $2, $3, $4)",
            ticket, current_user.client_id, current_user.id, expires_at,
        )
    return {"ticket": ticket, "expires_in": _SSE_TICKET_TTL}


@_extra.get("/stream/insights", summary="SSE stream of new VoC insights")
async def stream_insights(
    request: Request,
    ticket: str | None = Query(default=None, description="Short-lived ticket from POST /api/sse-ticket (preferred)"),
    token: str | None = Query(default=None, description="JWT bearer fallback — prefer ticket to avoid log leakage"),
):
    """
    Server-Sent Events stream (CLAUDE.md §12).  Uses PostgreSQL LISTEN/NOTIFY
    for real-time push. Client closes the EventSource to stop.

    Auth: prefer POST /api/sse-ticket → use returned ticket here.  Raw JWT query
    param is accepted as a fallback but should not be used in production (token
    appears in access logs / proxies).  In same-origin CloudFront/ALB production
    a secure HttpOnly cookie is the ideal long-term approach.
    """
    if ticket is not None:
        if _db.pool is None:
            raise HTTPException(status_code=503, detail="Database unavailable.")
        # Single-use: DELETE … RETURNING atomically consumes the ticket.
        async with _db.pool.acquire() as conn:
            row = await conn.fetchrow(
                "DELETE FROM sse_tickets WHERE ticket = $1 RETURNING client_id, expires_at",
                ticket,
            )
        if row is None or row["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="SSE ticket invalid or expired.")
        client_id = row["client_id"]
    elif token is not None:
        current_user = await get_current_user(token)
        client_id = current_user.client_id
    else:
        raise HTTPException(status_code=401, detail="Authentication required.")

    last_event_id = request.headers.get("Last-Event-ID")

    async def _generator():
        from app.services.realtime_service import broker
        queue = broker.subscribe(client_id)

        try:
            if last_event_id:
                try:
                    last_id = UUID(last_event_id)
                    async with acquire_for_client(client_id) as conn:
                        missed_rows = await conn.fetch(
                            "SELECT id, event_type, entity_id, payload, created_at "
                            "FROM realtime_events "
                            "WHERE client_id = $1 AND created_at > ("
                            "   SELECT created_at FROM realtime_events WHERE id = $2 AND client_id = $1"
                            ") ORDER BY created_at ASC",
                            client_id, last_id
                        )
                    for row in missed_rows:
                        evt_data = _row_dict(row)
                        if isinstance(evt_data.get('payload'), str):
                            evt_data['payload'] = json.loads(evt_data['payload'])
                        yield f"id: {evt_data['id']}\nevent: {evt_data['event_type']}\ndata: {json.dumps(evt_data)}\n\n"
                except (ValueError, TypeError):
                    pass

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    if "client_id" in data:
                        del data["client_id"]
                    yield f"id: {data.get('id')}\nevent: {data.get('event_type')}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield f"event: heartbeat\ndata: {json.dumps({'time': datetime.now(timezone.utc).isoformat()})}\n\n"
        finally:
            broker.unsubscribe(client_id, queue)

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
