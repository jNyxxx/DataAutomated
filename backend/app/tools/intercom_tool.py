"""`fetch_intercom_conversations` — Intercom API, used by the VoC agent (CLAUDE.md §8).

Fetches recently-updated customer conversations via the Intercom Search API and
returns them as normalized feedback records suitable for NLP processing.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"access_token": str}
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(body: str) -> str:
    """Reduce Intercom's HTML message bodies to plain text for NLP processing."""
    return _TAG_RE.sub(" ", body or "").strip()


class IntercomFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_hours: int = Field(default=720, description="Fetch conversations updated in the last N hours")


class IntercomConversationsTool(DataAutomatedBaseTool):
    name: str = "fetch_intercom_conversations"
    description: str = (
        "Fetch recently-updated Intercom customer conversations for the client. "
        "Returns normalized feedback records."
    )
    args_schema: Type[BaseModel] = IntercomFetchInput
    category: str = "voc"
    source_type: str = "intercom"

    async def _arun(
        self,
        client_id: UUID,
        since_hours: int = 720,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            access_token = creds["access_token"]

            since_epoch = int(
                (datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)).timestamp()
            )
            url = "https://api.intercom.io/conversations/search"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            }
            payload = {
                "query": {"field": "updated_at", "operator": ">", "value": since_epoch}
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.post, url, headers=headers, json=payload
                )
            response.raise_for_status()
            conversations = response.json().get("conversations", [])

            return [
                {
                    "id": str(c.get("id", "")),
                    "content": _strip_html((c.get("source") or {}).get("body", "")),
                    "metadata": {
                        "subject": (c.get("source") or {}).get("subject"),
                        "state": c.get("state"),
                        "created_at": c.get("created_at"),
                        "source_type": "intercom",
                    },
                }
                for c in conversations
                if isinstance(c, dict)
            ]
        except Exception as exc:
            logger.warning(
                "fetch_intercom_conversations failed for client %s: %s", client_id, exc
            )
            return []
