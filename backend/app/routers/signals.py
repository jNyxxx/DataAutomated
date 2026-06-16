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

import datetime as _dt
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status

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

PERIOD_DELTAS: dict[str, _dt.timedelta] = {
    "last_7_days": _dt.timedelta(days=7),
    "last_14_days": _dt.timedelta(days=14),
    "last_30_days": _dt.timedelta(days=30),
    "last_90_days": _dt.timedelta(days=90),
}


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


def _extract_competitor_names(raw_config: Any) -> list[str]:
    if isinstance(raw_config, str):
        try:
            raw_config = json.loads(raw_config)
        except json.JSONDecodeError:
            raw_config = {}
    if not isinstance(raw_config, dict):
        return []

    names: list[str] = []
    competitors = raw_config.get("competitors")
    if isinstance(competitors, list):
        names.extend(
            name.strip()
            for name in competitors
            if isinstance(name, str) and name.strip()
        )

    single = raw_config.get("competitor_name")
    if isinstance(single, str) and single.strip():
        names.append(single.strip())

    deduped: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(name)
    return deduped


router = APIRouter(prefix="/signals", tags=["Competitive Signals"])
_extra = APIRouter(tags=["Competitive Signals"])


async def _run_comp_signal_analysis(client_id: UUID) -> None:
    """Dispatch the Competitive Signal LangGraph agent with job lifecycle tracking."""
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not configured; CompSig agent skipped for client %s", client_id)
        return
    from app.services.job_service import run_tracked
    from app.agents.comp_signal_agent import run_comp_signal_analysis
    await run_tracked(client_id, "comp_signal", run_comp_signal_analysis(client_id))


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
        "signals": [_row_dict(r) for r in rows],
        "total": total,
    }


@router.get("/overview", summary="Velocity and sidebar aggregates for the caller's client")
async def overview(
    period: str = Query(default="last_14_days"),
    current_user: CurrentUser = Depends(get_current_user),
):
    delta = PERIOD_DELTAS.get(period, PERIOD_DELTAS["last_14_days"])
    cutoff = _dt.datetime.now(_dt.timezone.utc) - delta

    async with acquire_for_client(current_user.client_id) as conn:
        competitor_source_rows = await conn.fetch(
            "SELECT config FROM data_sources "
            "WHERE client_id = $1 AND source_type = 'competitor_monitor' AND is_active = TRUE",
            current_user.client_id,
        )
        velocity_rows = await conn.fetch(
            "SELECT (detected_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS count "
            "FROM competitive_signals "
            "WHERE client_id = $1 AND detected_at >= $2 "
            "GROUP BY 1 "
            "ORDER BY 1",
            current_user.client_id,
            cutoff,
        )
        signals_7d = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals "
            "WHERE client_id = $1 AND detected_at >= NOW() - INTERVAL '7 days'",
            current_user.client_id,
        )
        tracked_competitors = await conn.fetchval(
            "SELECT COUNT(DISTINCT competitor_name) FROM competitive_signals "
            "WHERE client_id = $1",
            current_user.client_id,
        )
        competitor_rows = await conn.fetch(
            "SELECT competitor_name, COUNT(*)::int AS count "
            "FROM competitive_signals "
            "WHERE client_id = $1 "
            "GROUP BY 1 "
            "ORDER BY 2 DESC, 1 ASC "
            "LIMIT 8",
            current_user.client_id,
        )
        latest_context = await conn.fetchval(
            "SELECT strategic_context FROM competitive_signals "
            "WHERE client_id = $1 "
            "ORDER BY detected_at DESC "
            "LIMIT 1",
            current_user.client_id,
        )
        # Share-of-voice: per-competitor signal counts by signal_type for the period
        sov_rows = await conn.fetch(
            "SELECT competitor_name, signal_type, COUNT(*)::int AS count "
            "FROM competitive_signals "
            "WHERE client_id = $1 AND detected_at >= $2 "
            "GROUP BY competitor_name, signal_type "
            "ORDER BY competitor_name, count DESC",
            current_user.client_id,
            cutoff,
        )

    configured_competitors: list[str] = []
    for row in competitor_source_rows:
        configured_competitors.extend(_extract_competitor_names(row["config"]))
    configured_competitors = list(dict.fromkeys(configured_competitors))

    signal_counts = {row["competitor_name"]: row["count"] for row in competitor_rows}
    competitor_names = list(dict.fromkeys(configured_competitors + list(signal_counts.keys())))

    # Build share-of-voice breakdown: {competitor_name: {signal_type: count}}
    sov: dict[str, dict[str, int]] = {}
    for row in sov_rows:
        comp = row["competitor_name"] or "unknown"
        stype = row["signal_type"] or "other"
        if comp not in sov:
            sov[comp] = {}
        sov[comp][stype] = row["count"]

    return {
        "period": period,
        "signals_7d": int(signals_7d or 0),
        "tracked_competitors": max(int(tracked_competitors or 0), len(configured_competitors)),
        "velocity": [
            {
                "day": row["day"].isoformat(),
                "label": row["day"].strftime("%b %d"),
                "count": row["count"],
            }
            for row in velocity_rows
        ],
        "competitors": [
            {"name": name, "count": int(signal_counts.get(name, 0))}
            for name in competitor_names[:8]
        ],
        "latest_context": latest_context,
        "share_of_voice": sov,
    }


@router.post(
    "/competitors",
    status_code=status.HTTP_201_CREATED,
    summary="Add a tracked competitor and optionally queue signal analysis",
)
async def add_tracked_competitor(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    import uuid as _uuid

    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=422, detail="Competitor name is required.")

    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT id, config FROM data_sources "
            "WHERE client_id = $1 AND source_type = 'competitor_monitor' "
            "ORDER BY created_at ASC LIMIT 1",
            current_user.client_id,
        )

        competitors = _extract_competitor_names(row["config"]) if row else []
        already_present = any(existing.casefold() == name.casefold() for existing in competitors)
        if not already_present:
            competitors.append(name)
        config = {"competitors": competitors}

        if row:
            source_id = row["id"]
            await conn.execute(
                "UPDATE data_sources "
                "SET config = $1::jsonb, is_active = TRUE, connection_status = 'active', connection_error = NULL "
                "WHERE id = $2 AND client_id = $3",
                json.dumps(config),
                source_id,
                current_user.client_id,
            )
        else:
            source_id = _uuid.uuid4()
            await conn.execute(
                "INSERT INTO data_sources "
                "(id, client_id, source_type, credentials, config, is_active, connection_status, created_at) "
                "VALUES ($1, $2, 'competitor_monitor', '{}'::jsonb, $3::jsonb, TRUE, 'active', NOW())",
                source_id,
                current_user.client_id,
                json.dumps(config),
            )

        # Any live compsig source (news, reddit, google_news) enables auto-queue
        active_live_tool_sources = await conn.fetchval(
            "SELECT COUNT(*) FROM data_sources "
            "WHERE client_id = $1 AND is_active = TRUE "
            "AND source_type IN ('news', 'reddit', 'google_news')",
            current_user.client_id,
        )

    analysis_queued = False
    if active_live_tool_sources and settings.openai_api_key:
        background_tasks.add_task(_run_comp_signal_analysis, client_id=current_user.client_id)
        analysis_queued = True

    return {
        "status": "ok",
        "source_id": str(source_id),
        "tracked_competitors": competitors,
        "analysis_queued": analysis_queued,
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
    return {"signal": _row_dict(row)}


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
    return {"signals": [_row_dict(r) for r in rows]}


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
