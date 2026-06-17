"""`fetch_typeform_responses` — Typeform API, used by the VoC agent (CLAUDE.md §8).

Fetches recent form responses for the client's Typeform account and returns them as
normalized feedback records suitable for NLP processing.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"access_token": str}
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


def _flatten_answers(answers: list) -> str:
    """Join Typeform answer values into a single string for NLP processing."""
    parts: list[str] = []
    for answer in answers:
        if not isinstance(answer, dict):
            continue
        answer_type = answer.get("type", "")
        if answer_type in ("text", "long_text", "short_text"):
            val = answer.get("text", "")
        elif answer_type == "choice":
            val = answer.get("choice", {}).get("label", "")
        elif answer_type == "choices":
            labels = answer.get("choices", {}).get("labels", [])
            val = ", ".join(str(lb) for lb in labels if lb)
        elif answer_type == "number":
            val = str(answer.get("number", ""))
        elif answer_type == "boolean":
            val = str(answer.get("boolean", ""))
        else:
            val = str(answer.get(answer_type) or answer.get("value", ""))
        if val:
            parts.append(val)
    return " | ".join(parts)


class TypeformFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    form_id: str = Field(description="Typeform form ID to fetch responses from")
    since_hours: int = Field(default=720, description="Fetch responses submitted in the last N hours")


class TypeformResponseTool(DataAutomatedBaseTool):
    name: str = "fetch_typeform_responses"
    description: str = (
        "Fetch recent Typeform form responses for the client. "
        "Returns normalized feedback records."
    )
    args_schema: Type[BaseModel] = TypeformFetchInput
    category: str = "voc"
    source_type: str = "typeform"

    async def _arun(
        self,
        client_id: UUID,
        form_id: str,
        since_hours: int = 720,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            access_token = creds["access_token"]

            since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
            url = f"https://api.typeform.com/forms/{form_id}/responses"
            headers = {"Authorization": f"Bearer {access_token}"}
            params = {"since": since_ts.replace(microsecond=0).isoformat().replace("+00:00", "Z")}

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.get, url, headers=headers, params=params
                )
            response.raise_for_status()
            items = response.json().get("items", [])

            return [
                {
                    "id": r.get("response_id", ""),
                    "content": _flatten_answers(r.get("answers", [])),
                    "metadata": {
                        "submitted_at": r.get("submitted_at"),
                        "form_id": form_id,
                        "source_type": "typeform",
                    },
                }
                for r in items
                if isinstance(r, dict)
            ]
        except Exception as exc:
            logger.warning(
                "fetch_typeform_responses failed for client %s / form %s: %s",
                client_id, form_id, exc,
            )
            return []
