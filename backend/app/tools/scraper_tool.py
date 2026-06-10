"""
CompSig external-signal tools (CLAUDE.md §8; MCP_ARCHITECTURE.md §3, §7):
  search_news_signals    — NewsAPI (licensed, credentialed) — fully implemented
  scrape_g2_reviews      — graceful-degrade stub (AUD-13/RISK-06: legal review pending)
  scrape_capterra_reviews — graceful-degrade stub (AUD-13/RISK-06: legal review pending)
  fetch_linkedin_jobs    — graceful-degrade stub (AUD-13/RISK-06: legal review pending)

Scraping policy (D5/AUD-13): G2, Capterra, and LinkedIn have no public API.  These tools
are structured correctly — proper BaseTool subclasses with args_schema, registry entries,
and correct output contract — but their _arun returns [] with a logged warning until a
maintainer approves the implementation after legal review.  Full HTTP scraping of these
sources requires explicit maintainer approval (RISK-06).

NewsAPI credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"api_key": str}
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")


# ---------------------------------------------------------------------------
# Shared args schema for CompSig tools (competitor-scoped)
# ---------------------------------------------------------------------------

class CompSigToolInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    competitors: list[str] = Field(description="List of competitor names to search for")
    since_hours: int = Field(default=48, description="Look back window in hours")


# ---------------------------------------------------------------------------
# NewsSignalTool — fully implemented (licensed NewsAPI)
# ---------------------------------------------------------------------------

class NewsSignalTool(DataAutomatedBaseTool):
    """
    Search for recent news articles about each competitor using NewsAPI (licensed).
    One concurrent HTTP request per competitor; partial failures are logged and skipped.
    """

    name: str = "search_news_signals"
    description: str = (
        "Search for recent news articles about competitors using NewsAPI. "
        "Returns normalized news records with competitor attribution."
    )
    args_schema: Type[BaseModel] = CompSigToolInput
    category: str = "compsig"
    source_type: str = "news"

    async def _arun(
        self,
        client_id: UUID,
        competitors: list[str],
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        if not competitors:
            return []
        try:
            creds = await self._load_credentials(client_id)
            api_key = creds["api_key"]
        except Exception as exc:
            logger.warning("search_news_signals: credential load failed for client %s: %s", client_id, exc)
            return []

        since_ts = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
        results: list[dict] = []

        async def _fetch_one(competitor: str) -> list[dict]:
            url = "https://newsapi.org/v2/everything"
            params = {
                "q": competitor,
                "from": since_ts.isoformat(),
                "sortBy": "publishedAt",
                "apiKey": api_key,
                "pageSize": "20",
            }
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await async_retry_with_backoff(client.get, url, params=params)
                response.raise_for_status()
                articles = response.json().get("articles", [])
                return [
                    {
                        "id": a.get("url", ""),
                        "content": f"{a.get('title', '')}. {a.get('description', '')}".strip(". "),
                        "metadata": {
                            "competitor_name": competitor,
                            "signal_source": a.get("url", ""),
                            "published_at": a.get("publishedAt"),
                            "source": a.get("source", {}).get("name"),
                            "source_type": "news",
                        },
                    }
                    for a in articles
                    if isinstance(a, dict) and (a.get("title") or a.get("description"))
                ]
            except Exception as exc:
                logger.warning(
                    "search_news_signals: fetch failed for competitor %r (client %s): %s",
                    competitor, client_id, exc,
                )
                return []

        per_competitor = await asyncio.gather(
            *[_fetch_one(c) for c in competitors],
            return_exceptions=True,
        )
        for outcome in per_competitor:
            if isinstance(outcome, Exception):
                logger.warning("search_news_signals: unexpected gather exception: %s", outcome)
            elif isinstance(outcome, list):
                results.extend(outcome)

        logger.info(
            '{"event":"news_signals.fetched","client_id":"%s","competitors":%d,"articles":%d}',
            client_id, len(competitors), len(results),
        )
        return results


# ---------------------------------------------------------------------------
# Graceful-degrade stubs (AUD-13/RISK-06 — legal review pending)
# ---------------------------------------------------------------------------

class G2ReviewScraper(DataAutomatedBaseTool):
    """
    Scrape G2 public review pages for competitor mentions.
    DEGRADED: returns [] pending legal review of ToS compliance (AUD-13/RISK-06).
    """

    name: str = "scrape_g2_reviews"
    description: str = (
        "Scrape G2 public review pages for competitor mentions. "
        "[DEGRADED: legal review pending per AUD-13/RISK-06]"
    )
    args_schema: Type[BaseModel] = CompSigToolInput
    category: str = "compsig"
    source_type: str = "g2"

    async def _arun(
        self,
        client_id: UUID,
        competitors: list[str],
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        logger.warning(
            "scrape_g2_reviews is a graceful-degrade stub "
            "(AUD-13: legal review pending for ToS compliance); "
            "returning [] for client %s",
            client_id,
        )
        return []


class CapterraReviewScraper(DataAutomatedBaseTool):
    """
    Scrape Capterra public review pages for competitor mentions.
    DEGRADED: returns [] pending legal review of ToS compliance (AUD-13/RISK-06).
    """

    name: str = "scrape_capterra_reviews"
    description: str = (
        "Scrape Capterra public review pages for competitor mentions. "
        "[DEGRADED: legal review pending per AUD-13/RISK-06]"
    )
    args_schema: Type[BaseModel] = CompSigToolInput
    category: str = "compsig"
    source_type: str = "capterra"

    async def _arun(
        self,
        client_id: UUID,
        competitors: list[str],
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        logger.warning(
            "scrape_capterra_reviews is a graceful-degrade stub "
            "(AUD-13: legal review pending for ToS compliance); "
            "returning [] for client %s",
            client_id,
        )
        return []


class LinkedInJobsScraper(DataAutomatedBaseTool):
    """
    Fetch LinkedIn job postings for competitor companies.
    DEGRADED: returns [] pending legal review of ToS compliance (AUD-13/RISK-06).
    """

    name: str = "fetch_linkedin_jobs"
    description: str = (
        "Fetch LinkedIn job postings for competitor companies. "
        "[DEGRADED: legal review pending per AUD-13/RISK-06]"
    )
    args_schema: Type[BaseModel] = CompSigToolInput
    category: str = "compsig"
    source_type: str = "linkedin_jobs"

    async def _arun(
        self,
        client_id: UUID,
        competitors: list[str],
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        logger.warning(
            "fetch_linkedin_jobs is a graceful-degrade stub "
            "(AUD-13: legal review pending for ToS compliance); "
            "returning [] for client %s",
            client_id,
        )
        return []
