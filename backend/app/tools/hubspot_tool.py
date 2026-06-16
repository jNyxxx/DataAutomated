"""`fetch_hubspot_feedback` — HubSpot CRM, used by the VoC agent (CLAUDE.md §8).

Fetches recently-updated support tickets and contact notes for the client's
HubSpot portal and returns them as normalized feedback records.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"access_token": str}   — HubSpot Private App token (Settings → Integrations → Private Apps)
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


class HubSpotFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_hours: int = Field(default=48, description="Fetch tickets updated in the last N hours")


class HubSpotFeedbackTool(DataAutomatedBaseTool):
    name: str = "fetch_hubspot_feedback"
    description: str = (
        "Fetch recently-updated HubSpot support tickets and contact notes. "
        "Returns normalized feedback records."
    )
    args_schema: Type[BaseModel] = HubSpotFetchInput
    category: str = "voc"
    source_type: str = "hubspot"

    async def _arun(
        self,
        client_id: UUID,
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            access_token = creds["access_token"]

            since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
            since_ms = int(since_ts.timestamp() * 1000)

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            url = "https://api.hubapi.com/crm/v3/objects/tickets/search"
            payload = {
                "filterGroups": [{
                    "filters": [{
                        "propertyName": "hs_lastmodifieddate",
                        "operator": "GTE",
                        "value": str(since_ms),
                    }]
                }],
                "properties": ["subject", "content", "hs_ticket_priority", "hs_pipeline_stage"],
                "limit": 100,
                "sorts": [{"propertyName": "hs_lastmodifieddate", "direction": "DESCENDING"}],
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.post, url, json=payload, headers=headers
                )
            response.raise_for_status()
            results = response.json().get("results", [])

            normalized = []
            for r in results:
                props = r.get("properties", {})
                content = props.get("content") or props.get("subject") or ""
                if not content:
                    continue
                normalized.append({
                    "id": str(r.get("id", "")),
                    "content": content,
                    "metadata": {
                        "subject": props.get("subject"),
                        "priority": props.get("hs_ticket_priority"),
                        "stage": props.get("hs_pipeline_stage"),
                        "source_type": "hubspot",
                    },
                })
            return normalized
        except Exception as exc:
            logger.warning(
                "fetch_hubspot_feedback failed for client %s: %s", client_id, exc
            )
            return []
