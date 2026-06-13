"""
Live credential validation for each supported source type.

Each validator makes a real, lightweight API call and maps the response to a
human-readable error so users know exactly what went wrong (wrong key, wrong
subdomain, missing permission, etc.) — never a generic "something failed".

Rules (CLAUDE.md §14):
  - Credentials are passed in as plaintext dicts (already decrypted by the caller).
  - Never log plaintext credentials or raw error bodies from vendor APIs.
  - Timeout: 10 s per call — fast enough to be invisible in the UI animation,
    generous enough for slow third-party APIs.

Returns:
  (True, None)            — credentials are valid and the integration is reachable
  (False, "error message") — validation failed with a specific human-readable reason
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0)


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


async def _get(client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
    return await client.get(url, timeout=_TIMEOUT, follow_redirects=True, **kwargs)


def _map_status(status: int, source_type: str) -> str:
    """Generic status → message for cases not handled by per-source logic."""
    if status == 401:
        return "Invalid credentials — authentication rejected by the API."
    if status == 403:
        return "Access denied — the provided credentials lack the required permissions."
    if status == 404:
        return "Resource not found — check your subdomain or account identifier."
    if status == 429:
        return "Rate limit hit — wait a moment then retry."
    if status >= 500:
        return f"{source_type.title()} API is temporarily unavailable (HTTP {status}). Try again shortly."
    return f"Unexpected response from {source_type.title()} API (HTTP {status})."


# ── Per-source validators ────────────────────────────────────────────────────

async def _validate_zendesk(creds: dict) -> tuple[bool, str | None]:
    subdomain = creds.get("subdomain", "").strip().rstrip("/")
    email     = creds.get("email", "").strip()
    api_token = creds.get("api_token", "").strip()

    if not subdomain:
        return False, "Subdomain is required (the part before .zendesk.com)."
    if not email:
        return False, "Agent email is required."
    if not api_token:
        return False, "API token is required."

    # Zendesk token auth: email/token:{api_token}
    auth_str = _b64(f"{email}/token:{api_token}")
    url = f"https://{subdomain}.zendesk.com/api/v2/account.json"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={"Authorization": f"Basic {auth_str}"})
    except httpx.ConnectError:
        return False, f"Could not reach {subdomain}.zendesk.com — check the subdomain."
    except httpx.TimeoutException:
        return False, "Connection timed out — Zendesk may be slow, retry in a moment."

    if r.status_code == 200:
        return True, None
    if r.status_code == 401:
        return False, "Invalid email or API token — authentication rejected by Zendesk."
    if r.status_code == 404:
        return False, f"Subdomain '{subdomain}' not found — verify it is correct."
    return False, _map_status(r.status_code, "zendesk")


async def _validate_typeform(creds: dict) -> tuple[bool, str | None]:
    access_token = creds.get("access_token", "").strip()
    if not access_token:
        return False, "Personal Access Token is required."

    url = "https://api.typeform.com/me"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={"Authorization": f"Bearer {access_token}"})
    except httpx.ConnectError:
        return False, "Could not reach api.typeform.com — check your network."
    except httpx.TimeoutException:
        return False, "Connection timed out — Typeform API may be slow, retry shortly."

    if r.status_code == 200:
        return True, None
    if r.status_code == 401:
        return False, "Invalid Personal Access Token — generate a new one in Typeform account settings."
    return False, _map_status(r.status_code, "typeform")


async def _validate_intercom(creds: dict) -> tuple[bool, str | None]:
    access_token = creds.get("access_token", "").strip()
    if not access_token:
        return False, "Access Token is required."

    url = "https://api.intercom.io/me"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            })
    except httpx.ConnectError:
        return False, "Could not reach api.intercom.io — check your network."
    except httpx.TimeoutException:
        return False, "Connection timed out — Intercom API may be slow, retry shortly."

    if r.status_code == 200:
        return True, None
    if r.status_code == 401:
        return False, "Invalid Access Token — regenerate it in the Intercom Developer Hub."
    if r.status_code == 403:
        return False, "Access denied — the token may lack the required scopes (needs read_users, read_conversations)."
    return False, _map_status(r.status_code, "intercom")


async def _validate_mixpanel(creds: dict) -> tuple[bool, str | None]:
    api_secret = creds.get("api_secret", "").strip()
    if not api_secret:
        return False, "API Secret is required."

    # Mixpanel JQL endpoint with basic auth: api_secret as username, empty password
    auth_str = _b64(f"{api_secret}:")
    url = "https://mixpanel.com/api/2.0/engage?limit=1"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={"Authorization": f"Basic {auth_str}"})
    except httpx.ConnectError:
        return False, "Could not reach mixpanel.com — check your network."
    except httpx.TimeoutException:
        return False, "Connection timed out — Mixpanel API may be slow, retry shortly."

    if r.status_code in (200, 400):
        # 400 can mean valid auth but bad query params — auth itself passed
        return True, None
    if r.status_code == 401:
        return False, "Invalid API Secret — find it in your Mixpanel project settings."
    if r.status_code == 403:
        return False, "Access denied — the API secret may not have Data Export permissions."
    return False, _map_status(r.status_code, "mixpanel")


async def _validate_segment(creds: dict) -> tuple[bool, str | None]:
    access_token = creds.get("access_token", "").strip()
    space_id     = creds.get("space_id", "").strip()
    if not access_token:
        return False, "Access Token is required."
    if not space_id:
        return False, "Space ID is required."

    # Segment Profiles API — list profiles endpoint (small page)
    auth_str = _b64(f"{access_token}:")
    url = f"https://profiles.segment.com/v1/spaces/{space_id}/collections/users/profiles?limit=1"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={"Authorization": f"Basic {auth_str}"})
    except httpx.ConnectError:
        return False, "Could not reach profiles.segment.com — check your network."
    except httpx.TimeoutException:
        return False, "Connection timed out — Segment API may be slow, retry shortly."

    if r.status_code == 200:
        return True, None
    if r.status_code == 401:
        return False, "Invalid Access Token — generate a new token in Segment's Access Management settings."
    if r.status_code == 403:
        return False, "Access denied — the token may lack Profiles API access."
    if r.status_code == 404:
        return False, f"Space ID '{space_id}' not found — verify it in your Segment workspace settings."
    return False, _map_status(r.status_code, "segment")


async def _validate_shopify(creds: dict) -> tuple[bool, str | None]:
    shop_domain  = creds.get("shop_domain", "").strip().rstrip("/")
    access_token = creds.get("access_token", "").strip()
    if not shop_domain:
        return False, "Shop Domain is required (e.g. yourstore.myshopify.com)."
    if not access_token:
        return False, "Admin API Access Token is required."

    # Normalise domain
    if not shop_domain.endswith(".myshopify.com"):
        shop_domain = f"{shop_domain}.myshopify.com"

    url = f"https://{shop_domain}/admin/api/2024-01/shop.json"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url, headers={"X-Shopify-Access-Token": access_token})
    except httpx.ConnectError:
        return False, f"Could not reach {shop_domain} — verify the shop domain."
    except httpx.TimeoutException:
        return False, "Connection timed out — Shopify may be slow, retry shortly."

    if r.status_code == 200:
        return True, None
    if r.status_code == 401:
        return False, "Invalid Access Token — it may have been revoked or regenerated."
    if r.status_code == 403:
        return False, "Access denied — the token may lack the required scopes (needs read_orders, read_customers)."
    if r.status_code == 404:
        return False, f"Shop domain '{shop_domain}' not found — check the domain spelling."
    return False, _map_status(r.status_code, "shopify")


async def _validate_news(creds: dict) -> tuple[bool, str | None]:
    api_key = creds.get("api_key", "").strip()
    if not api_key:
        return False, "NewsAPI Key is required."

    url = f"https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey={api_key}"
    try:
        async with httpx.AsyncClient() as client:
            r = await _get(client, url)
    except httpx.ConnectError:
        return False, "Could not reach newsapi.org — check your network."
    except httpx.TimeoutException:
        return False, "Connection timed out — NewsAPI may be slow, retry shortly."

    if r.status_code == 200:
        try:
            body = r.json()
            if body.get("status") == "ok":
                return True, None
            code = body.get("code", "")
            message = body.get("message", "")
            if code == "apiKeyInvalid":
                return False, "Invalid API Key — generate a new one at newsapi.org."
            if code == "apiKeyDisabled":
                return False, "This API Key has been disabled — contact newsapi.org support."
            if code == "apiKeyExhausted":
                return False, "API Key request limit reached — upgrade your plan at newsapi.org."
            if message:
                return False, f"NewsAPI error: {message}"
        except Exception:
            pass
        return True, None
    if r.status_code == 401:
        return False, "Invalid API Key — generate a new one at newsapi.org/account."
    if r.status_code == 429:
        return False, "Rate limit exceeded — your NewsAPI plan may be limited. Try again in a minute."
    return False, _map_status(r.status_code, "news")


async def _validate_competitor_monitor(creds: dict, config: dict) -> tuple[bool, str | None]:
    competitors = config.get("competitors", "").strip()
    if not competitors:
        return False, "At least one competitor name is required in the configuration."
    return True, None


# ── Public dispatcher ────────────────────────────────────────────────────────

#: Sources that activate immediately without any API call.
NO_CREDS_SOURCES = frozenset({"g2", "capterra", "linkedin_jobs"})

_VALIDATORS = {
    "zendesk":            _validate_zendesk,
    "typeform":           _validate_typeform,
    "intercom":           _validate_intercom,
    "mixpanel":           _validate_mixpanel,
    "segment":            _validate_segment,
    "shopify":            _validate_shopify,
    "news":               _validate_news,
}


async def validate_connection(
    source_type: str,
    creds: dict,
    config: dict | None = None,
) -> tuple[bool, str | None]:
    """
    Dispatch to the correct validator for `source_type`.

    Returns (True, None) on success, (False, human_error) on failure.
    Sources not in _VALIDATORS and not in NO_CREDS_SOURCES activate automatically
    (e.g. competitor_monitor — validated via config only).
    """
    if source_type in NO_CREDS_SOURCES:
        return True, None

    if source_type == "competitor_monitor":
        return await _validate_competitor_monitor(creds, config or {})

    validator = _VALIDATORS.get(source_type)
    if validator is None:
        # Unknown source type — allow through with a warning
        logger.warning("No validator defined for source_type=%r, auto-activating", source_type)
        return True, None

    try:
        return await validator(creds)
    except Exception:
        logger.exception("Unexpected error in validator for source_type=%r", source_type)
        return False, "An unexpected error occurred during validation. Please try again."
