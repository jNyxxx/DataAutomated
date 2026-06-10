"""Journey ingestion tools — Mixpanel / Segment / Shopify (CLAUDE.md §8, §7.3).

  fetch_mixpanel_events  — Mixpanel raw Export API (licensed, credentialed)
  fetch_segment_events   — Segment Profiles API (per-profile event listing)
  fetch_shopify_events   — Shopify Admin Events API

All three return the normalization contract list[{"id", "content", "metadata"}]
(base_tool.py): `content` carries the event type; `metadata` carries the
journey_events column candidates (session_id, user_id, event_type, occurred_at,
properties).  ingestion_service.py maps metadata → journey_events rows; the
Journey agent itself reads only the journey_events table (journey_agent.py).

Segment caveat (documented simplification): Segment exposes no global REST
event-export endpoint — events stream to webhook destinations or warehouse
syncs.  fetch_segment_events therefore lists events per known profile via the
Profiles API; the profile external IDs come from data_sources.config
("user_ids").  Without configured user_ids the tool degrades gracefully to []
(same pattern as the scraper stubs, RISK-10).

Credential shapes (AES-256 encrypted in data_sources.credentials, SR-04):
  mixpanel: {"api_secret": str}
  segment:  {"space_id": str, "access_token": str}
  shopify:  {"shop_domain": str, "access_token": str}
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")

_SHOPIFY_API_VERSION = "2024-01"


def _epoch_to_iso(epoch: Any) -> str | None:
    """Mixpanel `time` is epoch seconds; journey_events.occurred_at is TIMESTAMPTZ."""
    try:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return None


# ---------------------------------------------------------------------------
# Mixpanel
# ---------------------------------------------------------------------------

class MixpanelFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_hours: int = Field(default=24, description="Fetch events recorded in the last N hours")


class MixpanelEventsTool(DataAutomatedBaseTool):
    name: str = "fetch_mixpanel_events"
    description: str = (
        "Fetch recent Mixpanel behavioral events for the client via the raw "
        "Export API. Returns normalized journey event records."
    )
    args_schema: Type[BaseModel] = MixpanelFetchInput
    category: str = "journey"
    source_type: str = "mixpanel"

    async def _arun(
        self,
        client_id: UUID,
        since_hours: int = 24,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            api_secret = creds["api_secret"]

            now = datetime.now(tz=timezone.utc)
            params = {
                "from_date": (now - timedelta(hours=since_hours)).strftime("%Y-%m-%d"),
                "to_date": now.strftime("%Y-%m-%d"),
            }
            url = "https://data.mixpanel.com/api/2.0/export"
            auth = httpx.BasicAuth(api_secret, "")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.get, url, params=params, auth=auth
                )
            response.raise_for_status()

            # The Export API streams NDJSON — one JSON event per line.
            events: list[dict] = []
            for line in (response.text or "").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

            normalized: list[dict] = []
            for e in events:
                if not isinstance(e, dict):
                    continue
                props = e.get("properties") or {}
                event_type = e.get("event") or ""
                distinct_id = props.get("distinct_id")
                occurred_at = _epoch_to_iso(props.get("time"))
                external_id = props.get("$insert_id") or f"{distinct_id}:{props.get('time')}"
                normalized.append({
                    "id": str(external_id),
                    "content": event_type,
                    "metadata": {
                        "session_id": props.get("$session_id") or distinct_id,
                        "user_id": distinct_id,
                        "event_type": event_type,
                        "occurred_at": occurred_at,
                        "properties": {
                            k: v for k, v in props.items()
                            if k in ("$current_url", "$screen_name", "$browser", "$os", "mp_lib")
                        },
                        "source_type": "mixpanel",
                    },
                })
            return normalized
        except Exception as exc:
            logger.warning("fetch_mixpanel_events failed for client %s: %s", client_id, exc)
            return []


# ---------------------------------------------------------------------------
# Segment
# ---------------------------------------------------------------------------

class SegmentFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    user_ids: list[str] = Field(
        default_factory=list,
        description="Segment profile external IDs to list events for (from data_sources.config)",
    )
    since_hours: int = Field(default=24, description="Only keep events from the last N hours")


class SegmentEventsTool(DataAutomatedBaseTool):
    name: str = "fetch_segment_events"
    description: str = (
        "Fetch recent Segment behavioral events for known user profiles via the "
        "Profiles API. Returns normalized journey event records."
    )
    args_schema: Type[BaseModel] = SegmentFetchInput
    category: str = "journey"
    source_type: str = "segment"

    async def _arun(
        self,
        client_id: UUID,
        user_ids: list[str] | None = None,
        since_hours: int = 24,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        if not user_ids:
            logger.info(
                "fetch_segment_events: no user_ids configured for client %s — "
                "Segment has no global event-export endpoint; returning [] (RISK-10).",
                client_id,
            )
            return []
        try:
            creds = await self._load_credentials(client_id)
            space_id = creds["space_id"]
            access_token = creds["access_token"]
            auth = httpx.BasicAuth(access_token, "")

            since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
            normalized: list[dict] = []

            async with httpx.AsyncClient(timeout=30.0) as client:
                for uid in user_ids:
                    url = (
                        f"https://profiles.segment.com/v1/spaces/{space_id}"
                        f"/collections/users/profiles/user_id:{uid}/events"
                    )
                    try:
                        response = await async_retry_with_backoff(client.get, url, auth=auth)
                        response.raise_for_status()
                    except Exception as exc:
                        # Per-profile failure tolerated — partial results still flow.
                        logger.warning(
                            "fetch_segment_events: profile %r failed for client %s: %s",
                            uid, client_id, exc,
                        )
                        continue
                    for e in response.json().get("data", []):
                        if not isinstance(e, dict):
                            continue
                        ts_raw = e.get("timestamp") or ""
                        try:
                            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                        except ValueError:
                            ts = None
                        if ts is not None and ts < since_ts:
                            continue
                        event_type = e.get("event") or e.get("type") or ""
                        normalized.append({
                            "id": str(e.get("message_id") or f"{uid}:{ts_raw}"),
                            "content": event_type,
                            "metadata": {
                                "session_id": (e.get("context") or {}).get("sessionId") or uid,
                                "user_id": uid,
                                "event_type": event_type,
                                "occurred_at": ts_raw or None,
                                "properties": e.get("properties") or {},
                                "source_type": "segment",
                            },
                        })
            return normalized
        except Exception as exc:
            logger.warning("fetch_segment_events failed for client %s: %s", client_id, exc)
            return []


# ---------------------------------------------------------------------------
# Shopify
# ---------------------------------------------------------------------------

class ShopifyFetchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    since_hours: int = Field(default=24, description="Fetch store events created in the last N hours")


class ShopifyEventsTool(DataAutomatedBaseTool):
    name: str = "fetch_shopify_events"
    description: str = (
        "Fetch recent Shopify store events (orders, products, checkouts) for the "
        "client via the Admin Events API. Returns normalized journey event records."
    )
    args_schema: Type[BaseModel] = ShopifyFetchInput
    category: str = "journey"
    source_type: str = "shopify"

    async def _arun(
        self,
        client_id: UUID,
        since_hours: int = 24,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        try:
            creds = await self._load_credentials(client_id)
            shop_domain = creds["shop_domain"]
            access_token = creds["access_token"]
            # Accept "acme" or "acme.myshopify.com"; never a full URL with scheme.
            shop_domain = shop_domain.removeprefix("https://").removeprefix("http://").rstrip("/")
            if "." not in shop_domain:
                shop_domain = f"{shop_domain}.myshopify.com"

            since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
            url = f"https://{shop_domain}/admin/api/{_SHOPIFY_API_VERSION}/events.json"
            headers = {"X-Shopify-Access-Token": access_token}
            params = {"created_at_min": since_ts.isoformat(), "limit": 250}

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await async_retry_with_backoff(
                    client.get, url, headers=headers, params=params
                )
            response.raise_for_status()
            events = response.json().get("events", [])

            normalized: list[dict] = []
            for e in events:
                if not isinstance(e, dict):
                    continue
                subject_type = str(e.get("subject_type") or "").lower()
                verb = str(e.get("verb") or "").lower()
                event_type = f"{subject_type}_{verb}".strip("_")
                subject_id = e.get("subject_id")
                normalized.append({
                    "id": str(e.get("id", "")),
                    "content": event_type,
                    "metadata": {
                        # Shopify store events carry no browser session — the
                        # subject (order/product) id is the closest journey key.
                        "session_id": str(subject_id) if subject_id is not None else None,
                        "user_id": str(e.get("author")) if e.get("author") else None,
                        "event_type": event_type,
                        "occurred_at": e.get("created_at"),
                        "properties": {"message": e.get("message"), "subject_id": subject_id},
                        "source_type": "shopify",
                    },
                })
            return normalized
        except Exception as exc:
            logger.warning("fetch_shopify_events failed for client %s: %s", client_id, exc)
            return []
