"""
Email delivery service (Phase 1 — invite-only onboarding).

Env-gated: sends via Resend when RESEND_API_KEY + RESEND_FROM_EMAIL are set;
falls back to dev-mode (logs the link + returns it) so invite flows work
without a verified domain during LOCAL TESTING ONLY mode (CLAUDE.md §1).

Never raises on delivery failure — the caller handles the fallback case by
returning the token directly to the admin (invite-only flow).
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger("dataautomated")


async def send_invite_email(
    *,
    to_email: str,
    invite_token: str,
    invited_by_email: str | None = None,
    org_name: str = "DataAutomated",
) -> bool:
    """
    Send an invite email to `to_email` containing the accept link.

    Returns True if the email was dispatched (or logged in dev mode).
    Returns False on delivery error — caller should surface the link as
    a fallback so the invite still works locally.
    """
    frontend_url = settings.frontend_url
    accept_url = f"{frontend_url}/invite/{invite_token}"

    if not settings.resend_api_key or settings.resend_api_key in (
        "", "replace_me", "change_me_locally"
    ):
        # Dev-mode: log the link; return it so the API response can include it.
        logger.info(
            '{"event": "email.dev_mode", "to": "%s", "accept_url": "%s"}',
            to_email,
            accept_url,
        )
        return True

    # Production path — send via Resend REST API.
    try:
        import httpx  # noqa: PLC0415 — optional production dep
        from_addr = settings.resend_from_email or f"noreply@{settings.resend_domain}"
        inviter = invited_by_email or org_name
        body = _build_invite_html(accept_url, org_name, inviter)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to_email],
                    "subject": f"You've been invited to {org_name} on DataAutomated",
                    "html": body,
                },
            )
        if resp.status_code not in (200, 201):
            logger.warning(
                '{"event": "email.send_failed", "to": "%s", "status": %d, "body": "%s"}',
                to_email,
                resp.status_code,
                resp.text[:200],
            )
            return False
        logger.info('{"event": "email.sent", "to": "%s"}', to_email)
        return True
    except Exception as exc:
        logger.warning(
            '{"event": "email.send_error", "to": "%s", "error": "%s"}',
            to_email,
            str(exc),
        )
        return False


def _build_invite_html(accept_url: str, org_name: str, inviter: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#e2e8f0;background:#0f172a;padding:32px;border-radius:12px;">
  <h2 style="color:#fff;margin:0 0 16px;">You've been invited to {org_name}</h2>
  <p style="color:#94a3b8;margin:0 0 24px;">{inviter} has invited you to join {org_name} on DataAutomated.</p>
  <a href="{accept_url}"
     style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;
            padding:12px 24px;border-radius:8px;font-weight:600;">
    Accept Invitation
  </a>
  <p style="color:#475569;font-size:12px;margin:24px 0 0;">
    This link expires in 7 days. If you didn't expect this invitation, ignore this email.
  </p>
</body>
</html>"""


