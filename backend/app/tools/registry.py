"""
Central tool registry + per-client resolution (CLAUDE.md §8; MCP_ARCHITECTURE.md §4;
PROJECT_STRUCTURE.md §4).

TOOL_REGISTRY maps data_sources.source_type → tool singleton (instantiated at import).
Tools are stateless — all per-call state flows through args_schema (client_id, etc.).

get_tools_for_client(client_id) queries data_sources for the client's active connections
and returns only the tools those sources map to (OR-04 per-client isolation).

Deviation note (CLAUDE.md §8): the spec shows a synchronous get_tools_for_client with a
synchronous get_client_data_sources helper.  DB access requires async (asyncpg pool);
both functions are async.  This deviation is safe and consistent with acquire_for_client
and the async-first architecture — mirrors the deviation note in database.py.

All ten §8 MVP source types are registered. The if-src-in-TOOL_REGISTRY guard
still protects against unknown source_types: clients with an unrecognized source
connected simply get no tool for it.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.database import acquire_for_client
from app.tools.base_tool import DataAutomatedBaseTool
from app.tools.ga4_tool import GA4EventsTool
from app.tools.google_news_tool import GoogleNewsSignalTool
from app.tools.hubspot_tool import HubSpotFeedbackTool
from app.tools.intercom_tool import IntercomConversationsTool
from app.tools.journey_tool import (
    MixpanelEventsTool,
    SegmentEventsTool,
    ShopifyEventsTool,
)
from app.tools.reddit_tool import RedditSignalTool
from app.tools.scraper_tool import (
    CapterraReviewScraper,
    G2ReviewScraper,
    LinkedInJobsScraper,
    NewsSignalTool,
)
from app.tools.typeform_tool import TypeformResponseTool
from app.tools.zendesk_tool import ZendeskFeedbackTool

logger = logging.getLogger("dataautomated")

# ---------------------------------------------------------------------------
# Singleton tool instances — one per tool type, shared across all calls.
# Per-call state (client_id, etc.) flows through the args_schema, not the
# instance.  Tools are Pydantic models with no mutable instance state.
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, DataAutomatedBaseTool] = {
    # VoC
    "zendesk":       ZendeskFeedbackTool(),
    "typeform":      TypeformResponseTool(),
    "intercom":      IntercomConversationsTool(),
    "hubspot":       HubSpotFeedbackTool(),
    # CompSig
    "news":          NewsSignalTool(),
    "g2":            G2ReviewScraper(),
    "capterra":      CapterraReviewScraper(),
    "linkedin_jobs": LinkedInJobsScraper(),
    "reddit":        RedditSignalTool(),
    "google_news":   GoogleNewsSignalTool(),
    # Journey
    "mixpanel":      MixpanelEventsTool(),
    "segment":       SegmentEventsTool(),
    "shopify":       ShopifyEventsTool(),
    "ga4":           GA4EventsTool(),
}


async def get_tools_for_client(
    client_id: UUID,
    category: str | None = None,
) -> list[DataAutomatedBaseTool]:
    """
    Return the tools whose source_type the client has connected (is_active = TRUE).

    Tenant isolation: acquire_for_client sets RLS + app.current_client_id;
    the explicit WHERE client_id = $1 is belt-and-suspenders (CLAUDE.md §6).

    category: optional filter — e.g. "compsig" for mine_signals_node so VoC
    tools (zendesk, typeform) are never dispatched to the CompSig agent even if
    the client has those sources connected.

    Returns [] on any error (registry failure must never crash an agent run).
    """
    try:
        async with acquire_for_client(client_id) as conn:
            rows = await conn.fetch(
                "SELECT source_type FROM data_sources "
                "WHERE client_id = $1 AND is_active = TRUE",
                client_id,
            )
        tools = [
            TOOL_REGISTRY[row["source_type"]]
            for row in rows
            if row["source_type"] in TOOL_REGISTRY
        ]
        if category is not None:
            tools = [t for t in tools if t.category == category]
        return tools
    except Exception as exc:
        logger.warning(
            "get_tools_for_client: registry lookup failed for client %s: %s",
            client_id, exc,
        )
        return []
