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

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status

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

router = APIRouter(tags=["Internal"])


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
    return {
        "clients": [
            {k: str(v) if v is not None else None for k, v in dict(r).items()}
            for r in rows
        ]
    }


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
async def dashboard_summary(current_user: CurrentUser = Depends(get_current_user)):
    """
    Aggregated KPI summary for the authenticated client's dashboard (< 300ms target).
    Returns: latest sentiment score, churn risk, unread signal count, and latest
    journey drop-off rate.  Uses acquire_for_client for full RLS + WHERE isolation.
    """
    async with acquire_for_client(current_user.client_id) as conn:
        insight = await conn.fetchrow(
            "SELECT sentiment_score, churn_risk, created_at "
            "FROM feedback_insights "
            "WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
            current_user.client_id,
        )
        unread_signals = await conn.fetchval(
            "SELECT COUNT(*) FROM competitive_signals "
            "WHERE client_id = $1 AND is_read = FALSE",
            current_user.client_id,
        )
        journey = await conn.fetchrow(
            "SELECT funnel_step, drop_off_rate FROM journey_insights "
            "WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
            current_user.client_id,
        )

    return {
        "sentiment_score": insight["sentiment_score"] if insight else None,
        "churn_risk": insight["churn_risk"] if insight else None,
        "unread_signals": unread_signals,
        "latest_funnel_step": journey["funnel_step"] if journey else None,
        "latest_drop_off_rate": journey["drop_off_rate"] if journey else None,
    }


@router.get("/api/reports/list")
async def list_reports(current_user: CurrentUser = Depends(get_current_user)):
    """Returns all generated reports for the authenticated client, newest first."""
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            """SELECT id, report_type, s3_key, period_start, period_end, created_at
               FROM reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 50""",
            current_user.client_id,
        )
    return {
        "reports": [
            {k: str(v) if v is not None else None for k, v in dict(r).items()}
            for r in rows
        ]
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
        "report": {k: str(v) if v is not None else None for k, v in dict(row).items()},
        "client_name": str(client["name"]) if client else None,
        "client_email": str(client["email"]) if client else None,
        "s3_url": presign_report_url(row["s3_key"]),
    }


@router.get("/api/reports/{report_id}/download-url")
async def report_download_url(
    report_id: str,
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

    from app.services.report_service import presign_report_url
    url = presign_report_url(row["s3_key"], expires_in=900)
    if url is None:
        raise HTTPException(status_code=503, detail="Report storage unavailable.")
    return {"url": url}


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
