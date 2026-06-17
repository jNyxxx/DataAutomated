"""
FastAPI application entry point (CLAUDE.md §10, ADR-001).

Lifespan: opens and closes the shared asyncpg pool (database.py).
Routers included (CLAUDE.md §10 prefixes / tags):
  auth         → /auth                  Authentication
  insights     → /insights              VoC Insights  (+ /stream/insights, /api/agents/voc/run, /api/ingest/trigger)
  signals      → /signals               Competitive Signals  (+ /api/agents/competitive-signal/run)
  journeys     → /journeys              Journey Analytics
  data_sources → /api/data-sources      Data-source CRUD
  webhooks     → /webhook/*             Vendor webhook ingestion + churn alert
  ops          → /api/clients/*, /api/reports/*, /api/dashboard/*   n8n + dashboard ops
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from jose import JWTError, jwt

from app.config import settings
from app.database import close_pool, init_pool
from app.routers import auth, data_sources, insights, journeys, ops, signals, webhooks
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)


async def _run_migrations() -> None:
    """Run `alembic upgrade head` as a subprocess before the pool opens.

    In development, a failed migration logs a warning and continues so the app
    still starts. In production, a failure raises (fail-loud, per §7).
    """
    import asyncio as _aio

    proc = await _aio.create_subprocess_exec(
        "alembic", "-c", "/app/alembic.ini", "upgrade", "head",
        stdout=_aio.subprocess.PIPE,
        stderr=_aio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    msg = (stdout.decode().strip() or "already up-to-date")
    if proc.returncode != 0:
        err = stderr.decode().strip()
        if settings.app_env == "production":
            raise RuntimeError(f"Migrations failed in production — refusing to start:\n{err}")
        logger.warning("Migrations failed (dev mode — continuing): %s", err)
    else:
        logger.info("migrations: %s", msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.run_migrations_on_startup:
        await _run_migrations()
    await init_pool()
    # LangSmith startup banner — confirms whether agent observability is active.
    if settings.langchain_api_key:
        _ws = (
            f" · workspace {settings.langsmith_workspace_id}"
            if settings.langsmith_workspace_id
            else " · LANGSMITH_WORKSPACE_ID not set — workspace-scoped traces may 403"
        )
        logger.info("LangSmith tracing active — project: %s%s", settings.langchain_project, _ws)
    else:
        logger.warning(
            "LangSmith tracing disabled — set LANGCHAIN_API_KEY + LANGSMITH_WORKSPACE_ID "
            "in .env and restart to enable agent observability (CLAUDE.md §16)"
        )
    # Boot trigger — immediately dispatch ingestion + agents for all active clients.
    # Fire-and-forget: errors are logged inside; startup health check is unaffected.
    # Works identically on docker-compose (local) and AWS ECS Fargate (§15).
    import asyncio as _asyncio
    from app.services.startup_service import trigger_all_active_clients
    _asyncio.create_task(trigger_all_active_clients())
    # Ensure the reports bucket exists in MinIO (local dev only; no-op in production
    # where S3_ENDPOINT_URL is blank and the real bucket is pre-created in AWS).
    if settings.s3_endpoint_url:
        try:
            import boto3 as _boto3
            from botocore.config import Config as _BotoConfig
            from botocore.exceptions import ClientError as _CE
            _s3 = _boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key_id or None,
                aws_secret_access_key=settings.s3_secret_access_key or None,
                region_name=settings.aws_region,
                config=_BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
            )
            try:
                _s3.head_bucket(Bucket=settings.s3_reports_bucket)
            except _CE as _e:
                if _e.response["Error"]["Code"] in ("404", "NoSuchBucket"):
                    _s3.create_bucket(Bucket=settings.s3_reports_bucket)
                    logger.info("minio bucket created: %s", settings.s3_reports_bucket)
                else:
                    raise
        except Exception as _exc:
            logger.warning("minio bucket init failed (will retry on next boot): %s", _exc)
    # S3/MinIO startup banner
    if settings.s3_endpoint_url:
        if not settings.s3_public_endpoint_url:
            logger.warning(
                "S3_PUBLIC_ENDPOINT_URL is not set — MinIO presigned report URLs will use "
                "the internal Docker hostname and won't be browser-reachable. "
                "Add S3_PUBLIC_ENDPOINT_URL=http://localhost:9000 to .env (ISSUE-07)."
            )
        else:
            logger.info(
                "MinIO mode — internal: %s · public: %s · bucket: %s",
                settings.s3_endpoint_url,
                settings.s3_public_endpoint_url,
                settings.s3_reports_bucket,
            )
    else:
        logger.info(
            "S3 mode — region: %s · bucket: %s (IAM task role)",
            settings.aws_region,
            settings.s3_reports_bucket,
        )
    # Retry sweeper — re-dispatch failed agent jobs every 120s (Phase 6 DLQ).
    # Runs as a background task; errors are logged inside sweep_failed_jobs and
    # never kill the application. The loop exits cleanly when the task is cancelled
    # on shutdown (CancelledError propagates out of asyncio.sleep).
    async def _sweep_loop():
        from app.services.job_service import sweep_failed_jobs
        while True:
            try:
                await _asyncio.sleep(120)
                await sweep_failed_jobs()
            except _asyncio.CancelledError:
                break
            except Exception as _exc:
                logger.warning("job sweep loop error: %s", _exc)

    _sweep_task = _asyncio.create_task(_sweep_loop(), name="job_sweep_loop")

    from app.services.realtime_service import broker
    _broker_task = _asyncio.create_task(broker.start_listening(), name="event_broker_loop")

    yield
    _sweep_task.cancel()
    _broker_task.cancel()
    await _asyncio.gather(_sweep_task, _broker_task, return_exceptions=True)
    await close_pool()


# ---------------------------------------------------------------------------
# Audit middleware (CLAUDE.md §14 — complete trail of all data access)
# ---------------------------------------------------------------------------

_AUDIT_EXEMPT_PATHS = {"/", "/health", "/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}


def _audit_identity(scope: dict) -> tuple[str | None, object]:
    """
    Best-effort (actor, client_id) from request headers for the audit row.
    JWT is verified (HS256) before its claims are trusted; n8n calls are
    identified by the presence of the webhook-secret header.
    """
    headers = {k.lower(): v for k, v in scope.get("headers", [])}
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


# ---------------------------------------------------------------------------
# Security middleware (CLAUDE.md §2, §14)
# ---------------------------------------------------------------------------

# Distributed rate limiter (per IP, per path prefix) — backed by PostgreSQL.
# Correct across all ECS task instances. See services/rate_limit_service.py.
_RATE_LIMIT_RULES: dict[str, tuple[int, int]] = {
    # path_prefix: (max_requests, window_seconds)
    "/auth/token": (10, 60),
    "/webhook/zendesk": (60, 60),
    "/webhook/typeform": (60, 60),
    "/webhook/intercom": (60, 60),
}

# Per-client API rate limit applied to authenticated endpoints (production only).
# Key = "client:{client_id}" bucketed per 60-second window.
_CLIENT_API_RATE_LIMIT: tuple[int, int] = (300, 60)   # 300 req / 60 s per client
_CLIENT_API_PATHS = ("/insights/", "/signals/", "/journeys/", "/api/")


class SecurityMiddleware:
    """
    Single ASGI middleware that enforces:
    1. Body size limit (reject > settings.max_body_size_bytes before reading the body).
    2. Security response headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
       HSTS is added only when APP_ENV=production (requires TLS in front).
    3. Per-IP rate limiting on sensitive path prefixes (see _RATE_LIMIT_RULES).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        headers_map = {k.lower(): v for k, v in scope.get("headers", [])}

        # ---- 1. Body size guard ----
        content_length = headers_map.get(b"content-length", b"0")
        try:
            if int(content_length) > settings.max_body_size_bytes:
                await send({"type": "http.response.start", "status": 413, "headers": []})
                await send({"type": "http.response.body", "body": b""})
                return
        except (ValueError, TypeError):
            pass

        # ---- 2. Distributed rate limiting (production only, Postgres-backed) ----
        if settings.app_env == "production":
            # 2a. Per-IP limits on sensitive path prefixes
            for prefix, (max_req, window) in _RATE_LIMIT_RULES.items():
                if path.startswith(prefix):
                    from app.services.rate_limit_service import check_rate_limit
                    client_ip = scope.get("client", ("unknown", 0))[0]
                    try:
                        allowed = await check_rate_limit(f"{client_ip}:{prefix}", max_req, window)
                    except Exception:
                        allowed = True  # fail open — don't block traffic on DB outage
                    if not allowed:
                        await send({
                            "type": "http.response.start",
                            "status": 429,
                            "headers": [(b"content-length", b"0"), (b"retry-after", str(window).encode())],
                        })
                        await send({"type": "http.response.body", "body": b""})
                        return
                    break
            # 2b. Per-client limits on authenticated API paths
            if any(path.startswith(p) for p in _CLIENT_API_PATHS):
                _, client_id = _audit_identity(scope)
                if client_id:
                    from app.services.rate_limit_service import check_rate_limit
                    max_req, window = _CLIENT_API_RATE_LIMIT
                    try:
                        allowed = await check_rate_limit(f"client:{client_id}", max_req, window)
                    except Exception:
                        allowed = True
                    if not allowed:
                        await send({
                            "type": "http.response.start",
                            "status": 429,
                            "headers": [(b"content-length", b"0"), (b"retry-after", b"60")],
                        })
                        await send({"type": "http.response.body", "body": b""})
                        return

        # ---- 3. Security response headers ----
        async def _send_with_headers(message):
            if message["type"] == "http.response.start":
                extra: list[tuple[bytes, bytes]] = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"content-security-policy",
                     b"default-src 'none'; frame-ancestors 'none'"),
                ]
                if settings.app_env == "production":
                    extra.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message = dict(message)
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, _send_with_headers)


# ---------------------------------------------------------------------------
# Sentry — env-gated error tracking (P11). Inert locally; activated in production
# by setting SENTRY_DSN. Must be initialised before the FastAPI app object is created
# so the Starlette/FastAPI integrations register their middleware automatically.
# send_default_pii=False honours GDPR §14; traces_sample_rate=0.1 limits volume.
# ---------------------------------------------------------------------------

if settings.sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.app_env,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(),
            ],
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        logger.info("sentry: initialized (env=%s)", settings.app_env)
    except Exception as _sentry_exc:
        logger.warning("sentry: init failed (non-fatal): %s", _sentry_exc)


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DataAutomated.io API",
    version="1.0.0",
    lifespan=lifespan,
)

# TrustedHostMiddleware — rejects requests with unexpected Host headers.
# In development "*" is the default (settings.allowed_hosts), so all hosts pass.
if settings.allowed_hosts and settings.allowed_hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

# CORS — allow only the approved origins (CLAUDE.md §10).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers + body-size + rate limiting.
app.add_middleware(SecurityMiddleware)

# Audit trail — every non-exempt API request lands in audit_log (§14).
app.add_middleware(AuditMiddleware)

# ---- Routers (CLAUDE.md §10 prefixes / tags) ----
app.include_router(auth.router)          # /auth   — Authentication
app.include_router(insights.router)      # /insights — VoC Insights
app.include_router(insights._extra)      # /stream/insights, /api/agents/voc/run, /api/ingest/trigger
app.include_router(signals.router)       # /signals  — Competitive Signals
app.include_router(signals._extra)       # /api/agents/competitive-signal/run
app.include_router(journeys.router)      # /journeys — Journey Analytics
app.include_router(data_sources.router)  # /api/data-sources
app.include_router(webhooks.router)      # /webhook/* + churn-alert
app.include_router(ops.router)           # /api/clients/*, /api/reports/*, /api/dashboard/*


# ---- Health ----

@app.get("/health", tags=["Health"])
async def health() -> dict:
    """Liveness probe used by docker-compose / ECS health checks."""
    return {"status": "ok", "service": "backend", "version": app.version}


@app.get("/", tags=["Health"])
async def root() -> dict:
    return {"name": "DataAutomated.io API", "version": app.version}
