"""`fetch_zendesk_feedback` — Zendesk API, used by the VoC agent (CLAUDE.md §8).

Fetches recently-updated support tickets for the client's Zendesk account and
returns them as normalized feedback records.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"subdomain": str, "email": str, "api_token": str}
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")


class ZendeskFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_hours: int = Field(default=24, description="Fetch tickets updated in the last N hours")


class ZendeskFeedbackTool(DataAutomatedBaseTool):
    name: str = "fetch_zendesk_feedback"
    description: str = (
        "Fetch recently-updated Zendesk support tickets for the client. "
        "Returns normalized feedback records."
    )
    args_schema: Type[BaseModel] = ZendeskFetchInput
    category: str = "voc"
    source_type: str = "zendesk"

    async def _arun(
        self,
        client_id: UUID,
        since_hours: int = 24,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            subdomain = creds["subdomain"]
            email = creds["email"]
            api_token = creds["api_token"]

            since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
            url = f"https://{subdomain}.zendesk.com/api/v2/tickets.json"
            params = {"updated_since": since_ts.isoformat()}
            auth = httpx.BasicAuth(f"{email}/token", api_token)

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.get, url, params=params, auth=auth
                )
            response.raise_for_status()
            tickets = response.json().get("tickets", [])

            return [
                {
                    "id": str(t["id"]),
                    "content": t.get("description") or "",
                    "metadata": {
                        "subject": t.get("subject"),
                        "status": t.get("status"),
                        "created_at": t.get("created_at"),
                        "source_type": "zendesk",
                    },
                }
                for t in tickets
                if isinstance(t, dict)
            ]
        except Exception as exc:
            logger.warning(
                "fetch_zendesk_feedback failed for client %s: %s", client_id, exc
            )
            return []
