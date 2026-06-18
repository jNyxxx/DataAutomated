"""
Operational / internal routes (CLAUDE.md §10, §13).

Routes for n8n workflows, dashboard KPIs, and report management.
All n8n-facing paths are part of a stable contract (CLAUDE.md §13) —
do not rename without updating all four n8n workflow JSON files.

GET  /api/clients/active-list                  — n8n WF-01/WF-03 ingestion loops
GET  /api/clients/with-competitive-monitoring  — n8n WF-02 competitive scan
GET  /api/dashboard/summary                    — aggregated KPIs (< 300ms target)
GET  /api/reports/list                         — authenticated client's reports
GET  /api/reports/{id}/download-url            — presigned S3 download URL (15 min)
GET  /api/reports/latest-for-client            — n8n WF-03 artifact lookup
POST /api/reports/generate                     — trigger PDF generation (async)
"""

from __future__ import annotations

import datetime as _dt
import logging
from typing import Any
from uuid import UUID as _UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse

import app.database as _db
from app.database import acquire_for_client
from app.routers.auth import (
    CurrentUser,
    get_current_user,
    oauth2_scheme_optional,
    require_n8n_webhook_secret,
    require_role,
    resolve_service_client,
    verify_n8n_secret,
)

logger = logging.getLogger(__name__)

PERIOD_DELTAS: dict[str, _dt.timedelta] = {
    "last_7_days":  _dt.timedelta(days=7),
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
        elif isinstance(v, _UUID):
            result[k] = str(v)
        else:
            result[k] = v
    return result


router = APIRouter(tags=["Internal"])


# ---------------------------------------------------------------------------
# GET /ready — deep readiness probe (CLAUDE.md Phase 7)
# ---------------------------------------------------------------------------

@router.get("/ready", tags=["Health"], summary="Deep readiness probe")
async def ready():
    """
    Per-dependency readiness check. Returns 200 with {"status":"ok"} when all
    critical dependencies are reachable, else 503 with per-check detail.

    Critical (503 on failure): postgres
    Degraded (noted but not fatal): openai_key, s3/minio, n8n
    """
    import asyncio as _asyncio
    from app.config import settings as _s

    checks: dict[str, str] = {}
    critical_ok = True

    # ---- Postgres (critical) ----
    if _db.pool is None:
        checks["postgres"] = "fail: pool not initialised"
        critical_ok = False
    else:
        try:
            await _db.pool.fetchval("SELECT 1")
            checks["postgres"] = "ok"
        except Exception as exc:
            checks["postgres"] = f"fail: {exc}"
            critical_ok = False

    # ---- OpenAI key (degraded only) ----
    checks["openai_key"] = "ok" if _s.openai_api_key else "missing — agents will not run"

    # ---- S3 / MinIO (degraded) — only checked when an endpoint is configured ----
    if _s.s3_endpoint_url:
        def _check_minio():
            import boto3 as _b3
            from botocore.config import Config as _C
            s3 = _b3.client(
                "s3",
                endpoint_url=_s.s3_endpoint_url,
                aws_access_key_id=_s.s3_access_key_id or None,
                aws_secret_access_key=_s.s3_secret_access_key or None,
                region_name=_s.aws_region,
                config=_C(signature_version="s3v4", s3={"addressing_style": "path"}),
            )
            s3.head_bucket(Bucket=_s.s3_reports_bucket)

        try:
            loop = _asyncio.get_event_loop()
            await loop.run_in_executor(None, _check_minio)
            checks["minio"] = "ok"
        except Exception as exc:
            checks["minio"] = f"degraded: {exc}"

    # ---- LangSmith tracing (degraded — optional; all three agents have @traceable) ----
    if not _s.langchain_api_key:
        checks["langsmith"] = "degraded: LANGCHAIN_API_KEY missing — agent traces will not appear"
    elif not _s.langchain_tracing_v2:
        checks["langsmith"] = "degraded: LANGCHAIN_TRACING_V2 is false — tracing disabled"
    else:
        ws_note = (
            " (LANGSMITH_WORKSPACE_ID missing — workspace-scoped traces may 403)"
            if not _s.langsmith_workspace_id
            else ""
        )
        checks["langsmith"] = f"ok{ws_note}"

    # ---- n8n (degraded — optional) ----
    if _s.n8n_webhook_url:
        import urllib.request as _req

        def _check_n8n():
            url = _s.n8n_webhook_url.rstrip("/") + "/healthz"
            with _req.urlopen(url, timeout=3) as r:  # nosec B310
                return r.status

        try:
            loop = _asyncio.get_event_loop()
            status_code = await loop.run_in_executor(None, _check_n8n)
            checks["n8n"] = "ok" if status_code < 400 else f"degraded: status {status_code}"
        except Exception as exc:
            checks["n8n"] = f"degraded: {exc}"

    overall = "ok" if critical_ok else "degraded"
    return JSONResponse(
        content={"status": overall, "checks": checks},
        status_code=200 if critical_ok else 503,
    )


@router.get("/api/clients/active-list")
async def active_clients(_internal_auth: None = Depends(require_n8n_webhook_secret)):
    """
    Returns all active clients.  Used by n8n ingestion workflows to loop over
    clients.  Admin-level query — no tenant context; runs as pool's login role.
    Requires X-N8N-Webhook-Secret.  This route returns cross-client operational
    data for n8n ingestion loops and must never be publicly readable.
    """
    if _db.pool is None:
        return {"clients": []}
    async with _db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email, plan FROM clients WHERE is_active = TRUE"
        )
    return {"clients": [_row_dict(r) for r in rows]}


@router.get("/api/clients/with-competitive-monitoring")
async def clients_with_competitive_monitoring(
    _internal_auth: None = Depends(require_n8n_webhook_secret),
):
    """
    Returns active clients that have at least one competitive monitoring source
    connected and active (CLAUDE.md §13 WF-02; §8 TOOL_REGISTRY).
    Source types considered competitive: g2, news, capterra, linkedin_jobs,
    competitor_monitor.  Uses a JOIN so only genuinely-configured clients appear.
    Requires X-N8N-Webhook-Secret.
    """
    if _db.pool is None:
        return {"clients": []}
    async with _db.pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT DISTINCT c.id, c.name, c.email, c.plan
               FROM clients c
               JOIN data_sources ds ON ds.client_id = c.id
               WHERE c.is_active = TRUE
                 AND ds.is_active = TRUE
                 AND ds.source_type IN (
                     'g2', 'news', 'capterra', 'linkedin_jobs', 'competitor_monitor'
                 )""",
        )
    return {
        "clients": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "email": r["email"],
                "plan": r["plan"],
            }
            for r in rows
        ]
    }


@router.get("/api/clients/me", summary="Return the caller's client profile (name, plan, email)")
async def client_me(current_user: CurrentUser = Depends(get_current_user)):
    """Returns the authenticated user's client record so the frontend can display real company info."""
    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT name, plan, email FROM clients WHERE id = $1",
            current_user.client_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Client not found.")
    return {"name": row["name"], "plan": row["plan"], "email": row["email"]}


@router.post("/api/clients/me/erase", summary="Erase the caller's own tenant (GDPR right to erasure)")
async def erase_my_client(
    payload: dict[str, Any],
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    GDPR right-to-erasure (SR-04). Admin-only and SELF-TENANT ONLY — operates on
    current_user.client_id, with no client_id path parameter, so no tenant can erase
    another (§6). Irreversible: requires {"confirm": "ERASE"} in the body. Personal
    data is deleted and the tenant shell + audit trail are anonymised; the caller's
    session becomes invalid once their user row is removed.
    """
    if payload.get("confirm") != "ERASE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Confirmation required: send {"confirm": "ERASE"}.',
        )
    from app.services.gdpr_service import erase_client

    counts = await erase_client(current_user.client_id, requested_by=str(current_user.id))
    return {"status": "erased", "deleted": counts}


@router.get("/api/dashboard/summary")
async def dashboard_summary(
    period: str = Query(default="last_30_days"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Aggregated KPI summary for the authenticated client's dashboard (< 300ms target).
    Returns: latest sentiment score, churn risk, unread signal count, and latest
    journey drop-off rate.  Uses acquire_for_client for full RLS + WHERE isolation.
    Optional `period` param filters results to last_7_days / last_30_days (default) /
    last_90_days / all_time.
    """
    delta = PERIOD_DELTAS.get(period)
    cutoff = (
        _dt.datetime.now(_dt.timezone.utc) - delta
        if delta is not None
        else _dt.datetime(1970, 1, 1, tzinfo=_dt.timezone.utc)
    )

    async with acquire_for_client(current_user.client_id) as conn:
        insight = await conn.fetchrow(
            "SELECT sentiment_score, churn_risk, created_at "
            "FROM feedback_insights "
            "WHERE client_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1",
            current_user.client_id,
            cutoff,
        )
        unread_signals = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals "
            "WHERE client_id = $1 AND is_read = FALSE AND detected_at >= $2",
            current_user.client_id,
            cutoff,
        )
        critical_signals = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals "
            "WHERE client_id = $1 AND urgency = 'critical' "
            "AND is_read = FALSE AND detected_at >= $2",
            current_user.client_id,
            cutoff,
        )
        journey = await conn.fetchrow(
            "SELECT funnel_step, drop_off_rate FROM journey_insights "
            "WHERE client_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1",
            current_user.client_id,
            cutoff,
        )
        try:
            agent_runs_24h = await conn.fetchval(
                "SELECT COUNT(*) FROM audit_log "
                "WHERE client_id = $1 AND created_at >= NOW() - INTERVAL '24 hours' AND actor LIKE '%agent'",
                current_user.client_id,
            )
            recent_agent_runs = await conn.fetch(
                "SELECT actor, resource, created_at FROM audit_log "
                "WHERE client_id = $1 AND actor LIKE '%agent' "
                "ORDER BY created_at DESC LIMIT 5",
                current_user.client_id,
            )
            hourly_rows = await conn.fetch(
                "SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS h, "
                "COUNT(*)::int AS c "
                "FROM audit_log "
                "WHERE client_id = $1 "
                "AND created_at >= NOW() - INTERVAL '24 hours' "
                "AND actor LIKE '%agent' "
                "GROUP BY 1 ORDER BY 1",
                current_user.client_id,
            )
            runs_hourly = [0] * 24
            for row in hourly_rows:
                hour = row["h"]
                if 0 <= hour < 24:
                    runs_hourly[hour] = row["c"]
        except Exception:
            logger.warning("audit_log query failed for client %s", current_user.client_id)
            agent_runs_24h = 0
            recent_agent_runs = []
            runs_hourly = [0] * 24

    return {
        "sentiment_score": insight["sentiment_score"] if insight else None,
        "churn_risk": insight["churn_risk"] if insight else None,
        "unread_signals": unread_signals,
        "critical_signals": int(critical_signals or 0),
        "latest_funnel_step": journey["funnel_step"] if journey else None,
        "latest_drop_off_rate": journey["drop_off_rate"] if journey else None,
        "agent_runs_24h": agent_runs_24h or 0,
        "runs_hourly": runs_hourly,
        "recent_agent_runs": [
            {
                "actor": r["actor"],
                "resource": r["resource"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in recent_agent_runs
        ],
    }


@router.get("/api/reports/list")
async def list_reports(current_user: CurrentUser = Depends(get_current_user)):
    """Returns all generated reports for the authenticated client, newest first."""
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            """SELECT id, report_type, s3_key, period_start, period_end, created_at, page_count
               FROM reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50""",
            current_user.client_id,
        )
    return {"reports": [_row_dict(r) for r in rows]}


@router.get("/api/reports/edition-stats")
async def edition_stats(
    period: str = Query(default="last_7_days"),
    current_user: CurrentUser = Depends(get_current_user),
):
    delta = PERIOD_DELTAS.get(period)
    cutoff = (
        _dt.datetime.now(_dt.timezone.utc) - delta
        if delta is not None
        else _dt.datetime(1970, 1, 1, tzinfo=_dt.timezone.utc)
    )

    async with acquire_for_client(current_user.client_id) as conn:
        sources = await conn.fetchval(
            "SELECT COUNT(*) FROM data_sources "
            "WHERE client_id = $1 AND is_active = TRUE",
            current_user.client_id,
        )
        signals = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals "
            "WHERE client_id = $1 AND detected_at >= $2",
            current_user.client_id,
            cutoff,
        )
        pages = await conn.fetchval(
            "SELECT COUNT(*) FROM feedback_insights "
            "WHERE client_id = $1 AND created_at >= $2",
            current_user.client_id,
            cutoff,
        )
        volume_rows = await conn.fetch(
            "SELECT TO_CHAR(day, 'Mon DD') AS day, signals "
            "FROM ("
            "    SELECT (detected_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS signals "
            "    FROM competitive_signals "
            "    WHERE client_id = $1 AND detected_at >= $2 "
            "    GROUP BY 1"
            ") daily "
            "ORDER BY day",
            current_user.client_id,
            cutoff,
        )

    return {
        "sources": int(sources or 0),
        "signals": int(signals or 0),
        "pages": int(pages or 0),
        "volume": [{"day": row["day"], "signals": row["signals"]} for row in volume_rows],
    }


@router.get("/api/reports/latest-for-client")
async def latest_report_for_client(
    client_id: str,
    report_id: str | None = None,
    _internal_auth: None = Depends(require_n8n_webhook_secret),
):
    """
    Returns a report row for an explicit client_id so n8n Workflow 3 can build
    the Resend download link, plus the client's name/email and a presigned S3 URL.

    When `report_id` is supplied (WF03 pins the artifact it just triggered),
    returns *exactly* that report — never a stale "latest" one — so a slow or
    failed generation yields no row (s3_url=None) and the workflow safely skips
    the send instead of emailing last week's PDF. Without `report_id`, returns
    the most recent report. Tenant-scoped: a report_id only resolves within its
    own client (§6). Requires X-N8N-Webhook-Secret (server-to-server — §13).
    """
    import uuid as _uuid

    resolved_client_id = await resolve_service_client(client_id)
    async with acquire_for_client(resolved_client_id) as conn:
        if report_id is not None:
            try:
                rid = _uuid.UUID(report_id)
            except (ValueError, AttributeError, TypeError):
                rid = None
            row = (
                await conn.fetchrow(
                    """SELECT id, report_type, s3_key, period_start, period_end, created_at
                       FROM reports
                       WHERE id = $1 AND client_id = $2""",
                    rid,
                    resolved_client_id,
                )
                if rid is not None
                else None
            )
        else:
            row = await conn.fetchrow(
                """SELECT id, report_type, s3_key, period_start, period_end, created_at
                   FROM reports
                   WHERE client_id = $1
                   ORDER BY created_at DESC LIMIT 1""",
                resolved_client_id,
            )
        client = await conn.fetchrow(
            "SELECT name, email FROM clients WHERE id = $1",
            resolved_client_id,
        )
    if row is None:
        logger.info(
            "report_fetch_skip: no row found client=%s report_id=%s",
            resolved_client_id,
            report_id,
        )
        return {
            "report": None,
            "client_name": str(client["name"]) if client else None,
            "client_email": str(client["email"]) if client else None,
            "s3_url": None,
        }
    from app.services.report_service import presign_report_url
    return {
        "report": _row_dict(row),
        "client_name": str(client["name"]) if client else None,
        "client_email": str(client["email"]) if client else None,
        "s3_url": presign_report_url(row["s3_key"]),
    }


@router.get("/api/reports/{report_id}/download-url")
async def report_download_url(
    report_id: str,
    inline: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Mint a short-lived presigned S3 URL so the dashboard can download a report
    PDF. Objects are private (§14) — the browser never sees a raw S3 path.
    Tenant-scoped: the row must belong to the caller's client (§6); another
    client's report_id 404s identically to a nonexistent one (no existence leak).
    15-minute expiry — minted per click, unlike the 7-day n8n email link.
    """
    import uuid as _uuid

    try:
        rid = _uuid.UUID(report_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=404, detail="Report not found.")

    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT s3_key FROM reports WHERE id = $1 AND client_id = $2",
            rid,
            current_user.client_id,
        )
    if row is None or not row["s3_key"]:
        raise HTTPException(status_code=404, detail="Report not found.")

    s3_key: str = row["s3_key"]

    from app.services.report_service import presign_report_url
    disposition = "inline" if inline else None
    url = presign_report_url(s3_key, expires_in=900, response_content_disposition=disposition)
    if url is None:
        raise HTTPException(status_code=503, detail="Report storage unavailable.")
    return {"url": url}


@router.get("/api/ops/jobs", summary="Recent agent jobs for the caller's client")
async def list_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns recent agent_jobs rows for the authenticated client (Phase 6 System panel).
    Tenant-scoped via RLS + explicit WHERE (CLAUDE.md §6).
    """
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            """SELECT id, job_type, status, attempts, max_attempts, last_error,
                      created_at, started_at, completed_at, next_retry_at
               FROM agent_jobs
               WHERE client_id = $1
               ORDER BY created_at DESC LIMIT $2""",
            current_user.client_id,
            limit,
        )
    return {"jobs": [_row_dict(r) for r in rows]}


@router.post("/api/ops/jobs/{job_id}/retry", status_code=202, summary="Manually retry a failed/dead job")
async def retry_job(
    job_id: str,
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Re-dispatch a failed or dead agent job (admin only). The job is reset to
    queued and the corresponding agent is re-run as a background task.
    """
    import uuid as _uuid2

    try:
        jid = _uuid2.UUID(job_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Job not found.")

    async with acquire_for_client(current_user.client_id) as conn:
        row = await conn.fetchrow(
            "SELECT status FROM agent_jobs WHERE id = $1 AND client_id = $2",
            jid, current_user.client_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if row["status"] not in ("failed", "dead"):
        raise HTTPException(
            status_code=409,
            detail=f"Job is '{row['status']}' — only failed or dead jobs can be retried.",
        )

    from app.services.job_service import retry_job_now
    import asyncio as _asyncio
    _asyncio.create_task(retry_job_now(current_user.client_id, job_id))
    return {"status": "retry_queued", "job_id": job_id}


@router.post("/api/reports/generate", status_code=202)
async def generate_report(
    payload: dict[str, Any],
    bg: BackgroundTasks,
    token: str | None = Depends(oauth2_scheme_optional),
    x_n8n_webhook_secret: str | None = Header(default=None),
):
    """
    Trigger PDF report generation (background task). Returns immediately;
    report_service generates PDF + S3 upload async.

    Dual-consumer auth: the dashboard sends a JWT bearer (client scope from the
    token); n8n Workflow 3 loops over all clients and authenticates with
    X-N8N-Webhook-Secret + an explicit client_id in the body (§13/§6).
    """
    if token is not None:
        current_user = await get_current_user(token)
        if current_user.role not in ("admin", "analyst"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        resolved_client_id = current_user.client_id
    else:
        verify_n8n_secret(x_n8n_webhook_secret)
        resolved_client_id = await resolve_service_client(payload.get("client_id"))

    report_type = payload.get("report_type", "weekly_intelligence")
    period = payload.get("period", "last_7_days")
    client_id = str(resolved_client_id)

    import uuid as _uuid
    report_id = str(_uuid.uuid4())

    if _db.pool is not None:
        import datetime as _dt
        async with acquire_for_client(resolved_client_id) as conn:
            await conn.execute(
                """INSERT INTO reports (id, client_id, report_type, created_at)
                   VALUES ($1, $2, $3, $4)""",
                _uuid.UUID(report_id),
                resolved_client_id,
                report_type,
                _dt.datetime.now(_dt.timezone.utc),
            )

    async def _run():
        if _db.pool is None:
            return
        try:
            from app.services.report_service import generate_report as _generate
            import uuid as _uuid2

            async with acquire_for_client(_uuid2.UUID(client_id)) as conn:
                await _generate(conn, client_id, report_type, period, report_id=report_id)
        except Exception as exc:
            logger.error("report generation failed client=%s report_id=%s error=%s", client_id, report_id, exc)

    bg.add_task(_run)
    return {"status": "report_queued", "report_id": report_id}
