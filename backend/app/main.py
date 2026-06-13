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
import time
from collections import defaultdict
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
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

# In-process rate limiter (per IP, per path prefix).
# NOTE: per-instance only — at 2–10 ECS tasks, limits apply independently.
# Production-grade distributed rate limiting requires AWS WAF (deferred).
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_RULES: dict[str, tuple[int, int]] = {
    # path_prefix: (max_requests, window_seconds)
    "/auth/token": (10, 60),
    "/webhook/zendesk": (60, 60),
    "/webhook/typeform": (60, 60),
    "/webhook/intercom": (60, 60),
}


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

        # ---- 2. Per-IP rate limiting (production only) ----
        for prefix, (max_req, window) in _RATE_LIMIT_RULES.items():
            if settings.app_env != "production":
                break
            if path.startswith(prefix):
                client_ip = scope.get("client", ("unknown", 0))[0]
                key = f"{client_ip}:{prefix}"
                now = time.monotonic()
                hits = _rate_limit_store[key]
                _rate_limit_store[key] = [t for t in hits if now - t < window]
                if len(_rate_limit_store[key]) >= max_req:
                    await send({
                        "type": "http.response.start",
                        "status": 429,
                        "headers": [(b"content-length", b"0"), (b"retry-after", str(window).encode())],
                    })
                    await send({"type": "http.response.body", "body": b""})
                    return
                _rate_limit_store[key].append(now)
                break

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
