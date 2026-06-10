"""
FastAPI application entry point (CLAUDE.md §10, ADR-001).

Lifespan: opens and closes the shared asyncpg pool (database.py).
Routers: auth / insights / signals / journeys included with their approved prefixes.
Inline /api/ routes that span domains (stable n8n contract — CLAUDE.md §10, §13):
  GET  /api/clients/active-list                  — admin query for n8n ingestion loops
  GET  /api/clients/with-competitive-monitoring  — clients with CompSig enabled (n8n)
  GET  /api/dashboard/summary                    — aggregated KPIs for the authenticated client (< 300ms)
  POST /api/reports/generate                     — stub; Phase 6 wires PDF + S3
  POST /webhook/churn-alert                      — churn webhook entry (n8n side); Phase 6
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt

import app.database as _db
from app.config import settings
from app.database import acquire_for_client, close_pool, init_pool
from app.routers import auth, insights, journeys, signals
from app.routers.auth import (
    CurrentUser,
    get_current_user,
    oauth2_scheme_optional,
    resolve_service_client,
    verify_n8n_secret,
)
from app.services.audit_service import record_audit


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


# ---- Audit middleware (CLAUDE.md §14 — complete trail of all data access) ----

# Liveness/docs are noise; SSE streams stay open for the client's session, so the
# post-response hook would only fire at disconnect — streams are exempt instead.
_AUDIT_EXEMPT_PATHS = {"/", "/health", "/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}


def _audit_identity(scope: dict) -> tuple[str | None, object]:
    """
    Best-effort (actor, client_id) from request headers for the audit row.
    The JWT is verified (HS256) before its claims are trusted; an n8n call is
    identified by the presence of the webhook-secret header (route-level auth
    decides validity — the recorded status code reflects rejections).
    """
    headers = {k.lower(): v for k, v in scope.get("headers", [])}  # bytes -> bytes
    auth_header = headers.get(b"authorization", b"").decode("latin-1")
    if auth_header.lower().startswith("bearer "):
        try:
            claims = jwt.decode(
                auth_header[7:],
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
            return claims.get("sub"), claims.get("client_id")
        except JWTError:
            return None, None
    if b"x-n8n-webhook-secret" in headers:
        return "n8n", None
    return None, None


class AuditMiddleware:
    """
    Pure ASGI middleware (not BaseHTTPMiddleware, so streaming responses are not
    re-wrapped) that appends one audit_log row per API request after the response
    completes. Write failures are swallowed inside record_audit — auditing must
    never take a request down with it.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or scope.get("method") == "OPTIONS"
            or scope.get("path") in _AUDIT_EXEMPT_PATHS
            or scope.get("path", "").startswith("/stream/")
        ):
            return await self.app(scope, receive, send)

        status_holder: dict[str, int | None] = {"status": None}

        async def _send(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, _send)
        finally:
            actor, claim_client_id = _audit_identity(scope)
            try:
                from uuid import UUID as _UUID

                client_id = _UUID(str(claim_client_id)) if claim_client_id else None
            except ValueError:
                client_id = None
            await record_audit(
                "http.request",
                client_id=client_id,
                actor=actor,
                resource=f"{scope.get('method')} {scope.get('path')}",
                detail={"status": status_holder["status"]},
            )


app = FastAPI(
    title="DataAutomated.io API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow only the approved origins (CLAUDE.md §10).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit trail — every non-exempt API request lands in audit_log (§14).
app.add_middleware(AuditMiddleware)

# ---- Routers (CLAUDE.md §10 prefixes / tags) ----
app.include_router(auth.router)         # /auth   — Authentication
app.include_router(insights.router)     # /insights — VoC Insights
app.include_router(insights._extra)     # /stream/insights, /api/agents/voc/run, /api/ingest/trigger
app.include_router(signals.router)      # /signals  — Competitive Signals
app.include_router(signals._extra)      # /api/agents/competitive-signal/run
app.include_router(journeys.router)     # /journeys — Journey Analytics


# ---- Internal auth ----

async def require_n8n_webhook_secret(
    x_n8n_webhook_secret: str | None = Header(default=None),
) -> None:
    """
    Protect internal n8n/server-to-server endpoints.

    CLAUDE.md §13 requires webhook auth via N8N_WEBHOOK_SECRET.  These routes
    expose cross-client operational data, so they must not be anonymously
    reachable.  Validation logic lives in app.routers.auth.verify_n8n_secret.
    """
    verify_n8n_secret(x_n8n_webhook_secret)


# ---- Health ----

@app.get("/health", tags=["Health"])
async def health() -> dict:
    """Liveness probe used by docker-compose / ECS health checks."""
    return {"status": "ok", "service": "backend", "version": app.version}


@app.get("/", tags=["Health"])
async def root() -> dict:
    return {"name": "DataAutomated.io API", "version": app.version}


# ---- Inline /api/ routes — stable n8n contract (CLAUDE.md §13) ----

@app.get("/api/clients/active-list", tags=["Internal"])
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


@app.get("/api/clients/with-competitive-monitoring", tags=["Internal"])
async def clients_with_competitive_monitoring(
    _internal_auth: None = Depends(require_n8n_webhook_secret),
):
    """
    Returns active clients that have competitive monitoring enabled.
    Used by the n8n Competitive Signal Monitor workflow to loop over targets.
    Requires X-N8N-Webhook-Secret.  Phase 5 narrows this to clients with
    competitive sources connected.
    Phase 5: filter by data_sources where source_type includes competitive sources.
    """
    if _db.pool is None:
        return {"clients": []}
    async with _db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, plan FROM clients WHERE is_active = TRUE"
        )
    return {
        "clients": [
            {"id": str(r["id"]), "name": r["name"], "plan": r["plan"]}
            for r in rows
        ]
    }


@app.get("/api/reports/list", tags=["Internal"])
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


@app.post("/api/reports/generate", status_code=202, tags=["Internal"])
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
        resolved_client_id = current_user.client_id
    else:
        verify_n8n_secret(x_n8n_webhook_secret)
        resolved_client_id = await resolve_service_client(payload.get("client_id"))

    report_type = payload.get("report_type", "weekly_intelligence")
    period = payload.get("period", "last_7_days")
    client_id = str(resolved_client_id)

    async def _run():
        if _db.pool is None:
            return
        try:
            # Lazy import: keeps the trigger path light and free of the PDF/S3
            # dependency chain (WeasyPrint/boto3) until the background run.
            from app.services.report_service import generate_report as _generate

            async with _db.pool.acquire() as conn:
                await _generate(conn, client_id, report_type, period)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("report generation failed: %s", exc)

    bg.add_task(_run)
    return {"status": "report_queued", "s3_key": None}


@app.post("/webhook/churn-alert", status_code=202, tags=["Internal"])
async def churn_alert_webhook(
    payload: dict[str, Any],
    _internal_auth: None = Depends(require_n8n_webhook_secret),
):
    """
    Churn alert entry point called by the VoC agent when churn_risk > 0.15.
    The n8n Churn Alert workflow is triggered here; it routes to Slack/Resend based on
    urgency (> 0.25 = URGENT; > 0.15 = standard early warning).
    Stub — Phase 6 wires n8n webhook dispatch. Requires X-N8N-Webhook-Secret.
    """
    return {"status": "received"}


@app.get("/api/data-sources", tags=["Internal"])
async def list_data_sources(current_user: CurrentUser = Depends(get_current_user)):
    """Returns data sources connected by the authenticated client. Credentials are never returned."""
    async with acquire_for_client(current_user.client_id) as conn:
        rows = await conn.fetch(
            """SELECT id, source_type, is_active, last_synced_at, created_at
               FROM data_sources WHERE client_id = $1 ORDER BY created_at ASC""",
            current_user.client_id,
        )
    return {
        "sources": [
            {
                "id": str(r["id"]),
                "source_type": r["source_type"],
                "is_active": r["is_active"],
                "last_synced_at": str(r["last_synced_at"]) if r["last_synced_at"] else None,
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


@app.post("/api/data-sources", status_code=201, tags=["Internal"])
async def add_data_source(
    payload: dict[str, Any],
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Add a new data source for the authenticated client.
    Credentials are AES-256-encrypted at the app layer before storage (CLAUDE.md §14).

    Uniqueness rule: a client may only connect ONE active source per source_type
    (the MCP tool registry resolves tools by source_type key — CLAUDE.md §8).
    Returns 409 Conflict if an active source of the same type already exists.
    """
    import uuid as _uuid
    from app.services.credential_encryption import encrypt_credentials

    source_type = payload.get("source_type", "").strip()
    raw_credentials = payload.get("credentials", {})
    config = payload.get("config", {})

    if not source_type:
        raise HTTPException(status_code=422, detail="source_type is required")

    async with acquire_for_client(current_user.client_id) as conn:
        # Uniqueness guard: one active source per type per client (CLAUDE.md §8).
        existing = await conn.fetchval(
            """SELECT id FROM data_sources
               WHERE client_id = $1 AND source_type = $2 AND is_active = TRUE
               LIMIT 1""",
            current_user.client_id,
            source_type,
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"A '{source_type}' source is already connected and active. "
                       "Disconnect or deactivate it before adding another.",
            )

        encrypted = encrypt_credentials(raw_credentials) if raw_credentials else {}
        new_id = _uuid.uuid4()
        await conn.execute(
            """INSERT INTO data_sources (id, client_id, source_type, credentials, config, is_active, created_at)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, TRUE, NOW())""",
            new_id,
            current_user.client_id,
            source_type,
            __import__("json").dumps(encrypted),
            __import__("json").dumps(config),
        )
    return {"id": str(new_id), "source_type": source_type, "status": "connected"}


@app.patch("/api/data-sources/{source_id}", tags=["Internal"])
async def update_data_source(
    source_id: str,
    payload: dict[str, Any],
    current_user: CurrentUser = Depends(get_current_user),
):
    """Toggle is_active for a data source owned by the authenticated client."""
    import uuid as _uuid
    is_active = payload.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=422, detail="is_active required")
    async with acquire_for_client(current_user.client_id) as conn:
        result = await conn.execute(
            """UPDATE data_sources SET is_active = $1
               WHERE id = $2 AND client_id = $3""",
            bool(is_active),
            _uuid.UUID(source_id),
            current_user.client_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Data source not found")
    return {"status": "updated"}


@app.get("/api/dashboard/summary", tags=["Internal"])
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
