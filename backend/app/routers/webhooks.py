"""
Vendor webhook ingestion endpoints (CLAUDE.md §2, §7.1, §8, §13).

POST /webhook/zendesk      — real-time Zendesk ticket ingestion
POST /webhook/typeform     — real-time Typeform response ingestion
POST /webhook/intercom     — real-time Intercom conversation ingestion
POST /webhook/churn-alert  — churn-risk alert forwarding to n8n (WF-04)

Signature verification:
  Zendesk  — HMAC-SHA256 over (timestamp + body); 5-minute replay window.
  Typeform — HMAC-SHA256 over body; sha256=<hex> prefix.
  Intercom — HMAC-SHA1  over body; sha1=<hex> prefix.

Fail-closed behaviour (CLAUDE.md §2, §14):
  • Secret set → enforce signature; reject mismatch.
  • Secret blank + APP_ENV=production → reject (fail-closed).
  • Secret blank + development → warn + allow (local testing).
"""

from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import json
import logging
import re as _re
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request

from app.config import settings
from app.database import acquire_for_client
from app.routers.auth import require_n8n_webhook_secret, resolve_service_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Webhooks"])


# ---------------------------------------------------------------------------
# Auto-trigger VoC agent after webhook ingestion
# ---------------------------------------------------------------------------

async def _auto_trigger_voc(client_id: UUID) -> None:
    """
    Enqueue-then-run the VoC agent in the background after a webhook stores
    new feedback.  Mirrors the pattern in insights._run_voc_analysis so that
    real-time webhooks produce dashboard updates within seconds, not hours.
    Exceptions are swallowed — webhook response must never depend on agent run.
    """
    if not settings.openai_api_key:
        logger.warning("_auto_trigger_voc: OPENAI_API_KEY not set; skipping for %s", client_id)
        return
    try:
        from app.agents.voc_agent import run_voc_analysis  # lazy import — heavy
        from app.services.job_service import run_tracked
        logger.info('{"event":"webhook.auto_trigger_voc","client_id":"%s"}', client_id)
        await run_tracked(client_id, "voc", run_voc_analysis(client_id))
    except Exception:
        logger.exception("_auto_trigger_voc: agent run failed for client %s", client_id)


# ---------------------------------------------------------------------------
# Shared SQL — insert feedback row with per-(client, source_type, external_id) dedup
# ---------------------------------------------------------------------------

_DEDUP_WEBHOOK_FEEDBACK = """
    INSERT INTO raw_feedback (client_id, source_id, source_type, external_id, content, metadata)
    SELECT $1, $2, $3::varchar, $4::varchar, $5::text, $6::jsonb
    WHERE NOT EXISTS (
        SELECT 1 FROM raw_feedback
        WHERE client_id = $1 AND source_type = $3::varchar AND external_id = $4::varchar
    )
"""


async def _source_id_for(client_id, source_type: str):
    """Return the UUID of the first active data source of given type, or None."""
    async with acquire_for_client(client_id) as conn:
        return await conn.fetchval(
            "SELECT id FROM data_sources "
            "WHERE client_id = $1 AND source_type = $2 AND is_active = TRUE LIMIT 1",
            client_id, source_type,
        )


# ---------------------------------------------------------------------------
# HMAC helpers
# ---------------------------------------------------------------------------

def _verify_zendesk_sig(body: bytes, timestamp: str, signature: str) -> bool:
    try:
        digest = _hmac.new(
            settings.zendesk_webhook_secret.encode("utf-8"),
            (timestamp + body.decode("utf-8")).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return _hmac.compare_digest(base64.b64encode(digest).decode("ascii"), signature)
    except Exception:
        return False


def _verify_typeform_sig(body: bytes, signature: str) -> bool:
    try:
        _, _, received = signature.partition("=")
        expected = _hmac.new(
            settings.typeform_webhook_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        return _hmac.compare_digest(expected, received)
    except Exception:
        return False


def _verify_intercom_sig(body: bytes, signature: str) -> bool:
    try:
        _, _, received = signature.partition("=")
        expected = _hmac.new(
            settings.intercom_webhook_secret.encode("utf-8"), body, hashlib.sha1
        ).hexdigest()
        return _hmac.compare_digest(expected, received)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/webhook/zendesk", status_code=200)
async def zendesk_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Query(..., description="Client UUID — embed when registering the webhook in Zendesk Admin"),
    x_zendesk_webhook_signature: str | None = Header(default=None),
    x_zendesk_webhook_signature_timestamp: str | None = Header(default=None),
):
    """
    Real-time Zendesk ticket event ingestion (CLAUDE.md §8 VoC).
    Register in Zendesk Admin › Settings › Webhooks with HMAC-SHA256 signing.
    Webhook URL: POST /webhook/zendesk?client_id={client_uuid}
    """
    body = await request.body()

    if settings.zendesk_webhook_secret:
        try:
            ts_val = float(x_zendesk_webhook_signature_timestamp or "")
            if abs(time.time() - ts_val) > 300:
                raise HTTPException(status_code=401, detail="Webhook timestamp expired.")
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Invalid Zendesk webhook signature.")
        if (
            not x_zendesk_webhook_signature
            or not _verify_zendesk_sig(
                body, x_zendesk_webhook_signature_timestamp, x_zendesk_webhook_signature
            )
        ):
            raise HTTPException(status_code=401, detail="Invalid Zendesk webhook signature.")
    elif settings.app_env == "production":
        raise HTTPException(status_code=401, detail="Webhook secret not configured.")
    else:
        logger.warning("zendesk_webhook: ZENDESK_WEBHOOK_SECRET not set; skipping signature check (dev only)")

    resolved_client_id = await resolve_service_client(client_id)
    data = json.loads(body)
    ticket = data.get("ticket") or {}
    description = (ticket.get("description") or "").strip()
    if not description:
        return {"status": "ignored", "reason": "empty_content"}

    source_id = await _source_id_for(resolved_client_id, "zendesk")
    if source_id is None:
        return {"status": "ignored", "reason": "no_active_zendesk_source"}

    new_row = False
    async with acquire_for_client(resolved_client_id) as conn:
        result = await conn.execute(
            _DEDUP_WEBHOOK_FEEDBACK,
            resolved_client_id,
            source_id,
            "zendesk",
            str(ticket.get("id", "")),
            description,
            json.dumps({
                "subject": ticket.get("subject"),
                "status": ticket.get("status"),
                "created_at": ticket.get("created_at"),
                "source_type": "zendesk",
                "via": "webhook",
            }),
        )
        new_row = result.endswith("1")
        await conn.execute(
            "UPDATE data_sources SET last_synced_at = NOW() WHERE id = $1 AND client_id = $2",
            source_id, resolved_client_id,
        )
    # Publish after the transaction commits so the row is visible to readers.
    if new_row:
        from app.services.realtime_service import publish_event
        await publish_event(resolved_client_id, "raw_feedback.created", str(ticket.get("id", "")), {"source": "zendesk"})
    logger.info('{"event":"webhook.ingested","source":"zendesk","client_id":"%s"}', resolved_client_id)
    background_tasks.add_task(_auto_trigger_voc, client_id=resolved_client_id)
    return {"status": "accepted"}


@router.post("/webhook/typeform", status_code=200)
async def typeform_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Query(..., description="Client UUID — embed when registering the webhook in Typeform"),
):
    """
    Real-time Typeform form response ingestion (CLAUDE.md §8 VoC).
    Register in Typeform admin with a webhook secret.
    Webhook URL: POST /webhook/typeform?client_id={client_uuid}
    """
    body = await request.body()
    typeform_signature = request.headers.get("typeform-signature")

    if settings.typeform_webhook_secret:
        if not typeform_signature or not _verify_typeform_sig(body, typeform_signature):
            raise HTTPException(status_code=401, detail="Invalid Typeform webhook signature.")
    elif settings.app_env == "production":
        raise HTTPException(status_code=401, detail="Webhook secret not configured.")
    else:
        logger.warning("typeform_webhook: TYPEFORM_WEBHOOK_SECRET not set; skipping signature check (dev only)")

    resolved_client_id = await resolve_service_client(client_id)
    data = json.loads(body)
    form_response = data.get("form_response") or {}
    answers = form_response.get("answers") or []
    parts = []
    for a in answers:
        if not isinstance(a, dict):
            continue
        atype = a.get("type", "")
        if atype in ("text", "long_text", "short_text"):
            parts.append(a.get("text", ""))
        elif atype == "choice":
            parts.append(a.get("choice", {}).get("label", ""))
        elif atype == "number":
            parts.append(str(a.get("number", "")))
    content = " | ".join(p for p in parts if p).strip()
    if not content:
        return {"status": "ignored", "reason": "empty_content"}

    source_id = await _source_id_for(resolved_client_id, "typeform")
    if source_id is None:
        return {"status": "ignored", "reason": "no_active_typeform_source"}

    new_row = False
    async with acquire_for_client(resolved_client_id) as conn:
        result = await conn.execute(
            _DEDUP_WEBHOOK_FEEDBACK,
            resolved_client_id,
            source_id,
            "typeform",
            form_response.get("token", ""),
            content,
            json.dumps({
                "form_id": form_response.get("form_id"),
                "submitted_at": form_response.get("submitted_at"),
                "source_type": "typeform",
                "via": "webhook",
            }),
        )
        new_row = result.endswith("1")
        await conn.execute(
            "UPDATE data_sources SET last_synced_at = NOW() WHERE id = $1 AND client_id = $2",
            source_id, resolved_client_id,
        )
    # Publish after the transaction commits so the row is visible to readers.
    if new_row:
        from app.services.realtime_service import publish_event
        await publish_event(resolved_client_id, "raw_feedback.created", form_response.get("token", ""), {"source": "typeform"})
    logger.info('{"event":"webhook.ingested","source":"typeform","client_id":"%s"}', resolved_client_id)
    background_tasks.add_task(_auto_trigger_voc, client_id=resolved_client_id)
    return {"status": "accepted"}


@router.post("/webhook/intercom", status_code=200)
async def intercom_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Query(..., description="Client UUID — embed when registering the webhook in Intercom"),
):
    """
    Real-time Intercom conversation event ingestion (CLAUDE.md §8 VoC).
    Register as a webhook in Intercom developer hub.
    Webhook URL: POST /webhook/intercom?client_id={client_uuid}
    """
    body = await request.body()
    x_hub_signature = request.headers.get("x-hub-signature")

    if settings.intercom_webhook_secret:
        if not x_hub_signature or not _verify_intercom_sig(body, x_hub_signature):
            raise HTTPException(status_code=401, detail="Invalid Intercom webhook signature.")
    elif settings.app_env == "production":
        raise HTTPException(status_code=401, detail="Webhook secret not configured.")
    else:
        logger.warning("intercom_webhook: INTERCOM_WEBHOOK_SECRET not set; skipping signature check (dev only)")

    resolved_client_id = await resolve_service_client(client_id)
    data = json.loads(body)
    item = (data.get("data") or {}).get("item") or {}
    source = item.get("source") or {}
    body_text = source.get("body") or ""
    content = _re.sub(r"<[^>]+>", " ", body_text).strip()
    if not content:
        return {"status": "ignored", "reason": "empty_content"}

    source_id = await _source_id_for(resolved_client_id, "intercom")
    if source_id is None:
        return {"status": "ignored", "reason": "no_active_intercom_source"}

    new_row = False
    async with acquire_for_client(resolved_client_id) as conn:
        result = await conn.execute(
            _DEDUP_WEBHOOK_FEEDBACK,
            resolved_client_id,
            source_id,
            "intercom",
            str(item.get("id", "")),
            content,
            json.dumps({
                "subject": source.get("subject"),
                "state": item.get("state"),
                "created_at": item.get("created_at"),
                "source_type": "intercom",
                "via": "webhook",
            }),
        )
        new_row = result.endswith("1")
        await conn.execute(
            "UPDATE data_sources SET last_synced_at = NOW() WHERE id = $1 AND client_id = $2",
            source_id, resolved_client_id,
        )
    # Publish after the transaction commits so the row is visible to readers.
    if new_row:
        from app.services.realtime_service import publish_event
        await publish_event(resolved_client_id, "raw_feedback.created", str(item.get("id", "")), {"source": "intercom"})
    logger.info('{"event":"webhook.ingested","source":"intercom","client_id":"%s"}', resolved_client_id)
    background_tasks.add_task(_auto_trigger_voc, client_id=resolved_client_id)
    return {"status": "accepted"}


@router.post("/webhook/churn-alert", status_code=202)
async def churn_alert_webhook(
    payload: dict[str, Any],
    bg: BackgroundTasks,
    _internal_auth: None = Depends(require_n8n_webhook_secret),
):
    """
    Called by the VoC agent when churn_risk_score > 0.15 (CLAUDE.md §7.1, §13 WF-04).
    Forwards the alert to n8n in the background; n8n routes based on urgency:
      > 0.25 → URGENT Resend to client + Slack #churn-monitor
      > 0.15 → standard early-warning Resend
    Requires X-N8N-Webhook-Secret.
    """
    churn_risk = float(payload.get("churn_risk_score", 0.0))
    client_id = payload.get("client_id")
    top_themes = payload.get("top_themes", [])
    urgency = "urgent" if churn_risk > 0.25 else "standard"

    async def _forward():
        if not settings.n8n_webhook_url:
            logger.warning(
                "churn_alert: n8n_webhook_url not configured; cannot dispatch for client %s",
                client_id,
            )
            return
        import httpx as _httpx
        url = f"{settings.n8n_webhook_url.rstrip('/')}/webhook/churn-alert"
        try:
            async with _httpx.AsyncClient(timeout=10.0) as http:
                await http.post(
                    url,
                    json={
                        "client_id": str(client_id) if client_id else None,
                        "churn_risk_score": churn_risk,
                        "top_themes": top_themes,
                        "urgency": urgency,
                    },
                    headers={"X-N8N-Webhook-Secret": settings.n8n_webhook_secret},
                )
            logger.info(
                '{"event":"churn_alert.dispatched","client_id":"%s","urgency":"%s"}',
                client_id, urgency,
            )
        except Exception as exc:
            logger.error(
                "churn_alert: n8n dispatch failed for client %s: %s", client_id, exc
            )

    bg.add_task(_forward)
    return {"status": "received", "urgency": urgency}
