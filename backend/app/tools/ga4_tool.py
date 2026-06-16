"""`fetch_ga4_events` — Google Analytics 4 Data API, used by the Journey agent (CLAUDE.md §8).

Fetches page-view and event data for behavioral journey reconstruction.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {
    "property_id":       str,  — GA4 property ID (numeric, e.g. "123456789")
    "credentials_json":  str,  — GCP service account JSON (full JSON string)
  }

Auth: Google Analytics Data API v1beta requires a GCP service account with the
"Viewer" role on the GA4 property.  The service account JSON is parsed at
call-time and never stored in plaintext.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool

logger = logging.getLogger("dataautomated")

_GA4_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"


async def _get_access_token(service_account: dict) -> str:
    """
    Exchange a GCP service account key for a short-lived OAuth2 access token.
    Uses the JWT bearer flow (RFC 7523).
    """
    import time
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        import base64
    except ImportError:
        raise ValueError(
            "cryptography package is required for GA4 service account auth. "
            "It is already in requirements.txt — ensure the container image is up to date."
        )

    client_email = service_account.get("client_email", "")
    private_key_str = service_account.get("private_key", "")
    if not client_email or not private_key_str:
        raise ValueError("GA4 service account JSON must contain 'client_email' and 'private_key'.")

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {
        "iss": client_email,
        "scope": _GA4_SCOPE,
        "aud": _GA4_TOKEN_URL,
        "iat": now,
        "exp": now + 3600,
    }

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    h = _b64url(json.dumps(header).encode())
    c = _b64url(json.dumps(claim).encode())
    signing_input = f"{h}.{c}".encode()

    private_key = serialization.load_pem_private_key(private_key_str.encode(), password=None)
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    jwt_token = f"{h}.{c}.{_b64url(signature)}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _GA4_TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token,
            },
        )
    resp.raise_for_status()
    return resp.json()["access_token"]


class GA4FetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_days: int = Field(default=7, description="Fetch events from the last N days")


class GA4EventsTool(DataAutomatedBaseTool):
    name: str = "fetch_ga4_events"
    description: str = (
        "Fetch page views and key events from Google Analytics 4 for behavioral journey analysis. "
        "Returns normalized event records."
    )
    args_schema: Type[BaseModel] = GA4FetchInput
    category: str = "journey"
    source_type: str = "ga4"

    async def _arun(
        self,
        client_id: UUID,
        since_days: int = 7,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            property_id = creds.get("property_id", "").strip()
            credentials_json_str = creds.get("credentials_json", "")

            if not property_id:
                raise ValueError("GA4 property_id is required.")
            if not credentials_json_str:
                raise ValueError("GA4 credentials_json (service account JSON) is required.")

            service_account = json.loads(credentials_json_str)
            access_token = await _get_access_token(service_account)

            end_date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
            start_date = (datetime.now(tz=timezone.utc) - timedelta(days=since_days)).strftime("%Y-%m-%d")

            url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
            payload = {
                "dateRanges": [{"startDate": start_date, "endDate": end_date}],
                "dimensions": [
                    {"name": "pagePath"},
                    {"name": "eventName"},
                    {"name": "sessionId"},
                    {"name": "date"},
                ],
                "metrics": [
                    {"name": "eventCount"},
                    {"name": "sessions"},
                ],
                "limit": 500,
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            response.raise_for_status()
            rows = response.json().get("rows", [])

            normalized = []
            dim_headers = [d["name"] for d in response.json().get("dimensionHeaders", [])]
            for row in rows:
                dims = {dim_headers[i]: row["dimensionValues"][i]["value"] for i in range(len(dim_headers))}
                normalized.append({
                    "id": f"{dims.get('sessionId','')}-{dims.get('date','')}-{dims.get('eventName','')}",
                    "content": f"{dims.get('eventName','')} on {dims.get('pagePath','')}",
                    "metadata": {
                        "event_type": dims.get("eventName"),
                        "page_path": dims.get("pagePath"),
                        "session_id": dims.get("sessionId"),
                        "date": dims.get("date"),
                        "source_type": "ga4",
                    },
                })
            return normalized
        except Exception as exc:
            logger.warning("fetch_ga4_events failed for client %s: %s", client_id, exc)
            return []
