"""
Webhook signature verification + replay protection + fail-closed tests
(CLAUDE.md §2, §13, §14; P2.2).

All tests in this file exercise paths that fire BEFORE any database access
(the signature/replay/fail-closed checks are the first guard layer) and therefore
do not require a running database.

Coverage:
  - Blank secret + production app_env → 401 fail-closed (all three vendors)
  - Zendesk replay guard: timestamp > 5 min old → 401
  - Zendesk future timestamp > 5 min → 401
  - Bad HMAC signature → 401 (all three vendors)
  - Valid HMAC signature passes the check (non-401; may fail at later DB step)
"""

from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import json
import time

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app

# A fake client UUID that doesn't exist in the DB — accepted formats but resolves to nothing.
_FAKE_CLIENT = "00000000-0000-0000-0000-000000000001"
_SECRET = "test-webhook-secret-for-unit-tests-x"

# Minimal Zendesk ticket payload used across tests.
_ZENDESK_BODY = json.dumps({
    "ticket": {
        "id": "999",
        "description": "Test feedback content",
        "subject": "Unit test ticket",
        "status": "open",
        "created_at": "2026-01-01T00:00:00Z",
    }
}).encode()

# Minimal Typeform body.
_TYPEFORM_BODY = json.dumps({
    "event_id": "test", "event_type": "form_response",
    "form_response": {"answers": [{"field": {"id": "f1"}, "text": "Some feedback"}]},
}).encode()

# Minimal Intercom body.
_INTERCOM_BODY = json.dumps({
    "type": "notification_event", "topic": "conversation.replied",
    "data": {"item": {"conversation_message": {"body": "Intercom reply text"}}},
}).encode()


# ---------------------------------------------------------------------------
# HMAC helpers (mirrors the private _verify_* functions in main.py)
# ---------------------------------------------------------------------------

def _zendesk_sig(secret: str, timestamp: str, body: bytes) -> str:
    digest = _hmac.new(
        secret.encode(),
        (timestamp + body.decode()).encode(),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def _typeform_sig(secret: str, body: bytes) -> str:
    return "sha256=" + _hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _intercom_sig(secret: str, body: bytes) -> str:
    return "sha1=" + _hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Fail-closed: blank secret + production app_env → 401
# ---------------------------------------------------------------------------

class TestFailClosed:
    async def test_zendesk_blank_secret_prod_rejects(self, client, monkeypatch):
        monkeypatch.setattr(settings, "zendesk_webhook_secret", "")
        monkeypatch.setattr(settings, "app_env", "production")
        ts = str(time.time())
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": "bad",
                "x-zendesk-webhook-signature-timestamp": ts,
            },
        )
        assert resp.status_code == 401, f"Blank secret + prod must fail-closed; got {resp.status_code}"

    async def test_typeform_blank_secret_prod_rejects(self, client, monkeypatch):
        monkeypatch.setattr(settings, "typeform_webhook_secret", "")
        monkeypatch.setattr(settings, "app_env", "production")
        resp = await client.post(
            f"/webhook/typeform?client_id={_FAKE_CLIENT}",
            content=_TYPEFORM_BODY,
            headers={"typeform-signature": "sha256=bad"},
        )
        assert resp.status_code == 401

    async def test_intercom_blank_secret_prod_rejects(self, client, monkeypatch):
        monkeypatch.setattr(settings, "intercom_webhook_secret", "")
        monkeypatch.setattr(settings, "app_env", "production")
        resp = await client.post(
            f"/webhook/intercom?client_id={_FAKE_CLIENT}",
            content=_INTERCOM_BODY,
            headers={"x-hub-signature": "sha1=bad"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Replay protection (Zendesk timestamp window = 5 minutes)
# ---------------------------------------------------------------------------

class TestReplayProtection:
    async def test_zendesk_stale_timestamp_rejected(self, client, monkeypatch):
        """Timestamp > 5 min in the past → 401 regardless of signature validity."""
        monkeypatch.setattr(settings, "zendesk_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        stale_ts = str(time.time() - 700)  # 700 s ago — beyond 5 min window
        sig = _zendesk_sig(_SECRET, stale_ts, _ZENDESK_BODY)
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": sig,
                "x-zendesk-webhook-signature-timestamp": stale_ts,
            },
        )
        assert resp.status_code == 401, f"Replay (stale ts) must be rejected; got {resp.status_code}"

    async def test_zendesk_future_timestamp_rejected(self, client, monkeypatch):
        """Timestamp > 5 min in the future is also outside the tolerance window."""
        monkeypatch.setattr(settings, "zendesk_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        future_ts = str(time.time() + 700)
        sig = _zendesk_sig(_SECRET, future_ts, _ZENDESK_BODY)
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": sig,
                "x-zendesk-webhook-signature-timestamp": future_ts,
            },
        )
        assert resp.status_code == 401

    async def test_zendesk_invalid_timestamp_format_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "zendesk_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": "bad",
                "x-zendesk-webhook-signature-timestamp": "not-a-timestamp",
            },
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Bad HMAC → 401
# ---------------------------------------------------------------------------

class TestBadSignature:
    async def test_zendesk_forged_signature_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "zendesk_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        ts = str(time.time())
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "x-zendesk-webhook-signature-timestamp": ts,
            },
        )
        assert resp.status_code == 401

    async def test_typeform_forged_signature_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "typeform_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        resp = await client.post(
            f"/webhook/typeform?client_id={_FAKE_CLIENT}",
            content=_TYPEFORM_BODY,
            headers={"typeform-signature": "sha256=" + "a" * 64},
        )
        assert resp.status_code == 401

    async def test_intercom_forged_signature_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "intercom_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        resp = await client.post(
            f"/webhook/intercom?client_id={_FAKE_CLIENT}",
            content=_INTERCOM_BODY,
            headers={"x-hub-signature": "sha1=" + "a" * 40},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Valid HMAC signature passes the check — non-401 response expected
# (may still fail at later DB step with a different status code)
# ---------------------------------------------------------------------------

class TestValidSignaturePasses:
    async def test_zendesk_valid_hmac_not_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "zendesk_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        ts = str(time.time())
        sig = _zendesk_sig(_SECRET, ts, _ZENDESK_BODY)
        resp = await client.post(
            f"/webhook/zendesk?client_id={_FAKE_CLIENT}",
            content=_ZENDESK_BODY,
            headers={
                "x-zendesk-webhook-signature": sig,
                "x-zendesk-webhook-signature-timestamp": ts,
            },
        )
        assert resp.status_code != 401, (
            f"Correct HMAC must pass signature check; got 401 (detail: {resp.text})"
        )

    async def test_typeform_valid_hmac_not_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "typeform_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        resp = await client.post(
            f"/webhook/typeform?client_id={_FAKE_CLIENT}",
            content=_TYPEFORM_BODY,
            headers={"typeform-signature": _typeform_sig(_SECRET, _TYPEFORM_BODY)},
        )
        assert resp.status_code != 401

    async def test_intercom_valid_hmac_not_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "intercom_webhook_secret", _SECRET)
        monkeypatch.setattr(settings, "app_env", "development")
        resp = await client.post(
            f"/webhook/intercom?client_id={_FAKE_CLIENT}",
            content=_INTERCOM_BODY,
            headers={"x-hub-signature": _intercom_sig(_SECRET, _INTERCOM_BODY)},
        )
        assert resp.status_code != 401
