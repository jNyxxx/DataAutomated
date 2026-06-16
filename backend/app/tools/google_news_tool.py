"""`search_google_news_signals` — SerpAPI Google News, used by the Competitive Signal agent
(CLAUDE.md §8).

Fetches recent Google News results for each competitor using SerpAPI
(https://serpapi.com/google-news-api). This avoids direct Google scraping and
provides structured, parsed news data within SerpAPI's licensed terms.

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {"api_key": str}  — SerpAPI key (https://serpapi.com/manage-api-key)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")

_SERPAPI_URL = "https://serpapi.com/search"


class GoogleNewsSearchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    competitors: list[str] = Field(description="List of competitor names to search for")
    since_hours: int = Field(default=48, description="Look back window in hours")


class GoogleNewsSignalTool(DataAutomatedBaseTool):
    name: str = "search_google_news_signals"
    description: str = (
        "Search Google News via SerpAPI for recent competitor mentions, funding, "
        "product launches, and press coverage. Returns normalized signal records."
    )
    args_schema: Type[BaseModel] = GoogleNewsSearchInput
    category: str = "compsig"
    source_type: str = "google_news"

    async def _arun(
        self,
        client_id: UUID,
        competitors: list[str] | None = None,
        since_hours: int = 48,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> list[dict]:
        if not competitors:
            return []
        try:
            creds = await self._load_credentials(client_id)
            api_key = creds["api_key"]

            results = await asyncio.gather(
                *[self._fetch_news(api_key, c) for c in competitors],
                return_exceptions=True,
            )

            normalized = []
            for i, res in enumerate(results):
                if isinstance(res, Exception):
                    logger.warning(
                        "Google News search failed for competitor %r: %s", competitors[i], res
                    )
                    continue
                normalized.extend(res)
            return normalized
        except Exception as exc:
            logger.warning("search_google_news_signals failed for client %s: %s", client_id, exc)
            return []

    async def _fetch_news(self, api_key: str, competitor: str) -> list[dict]:
        params = {
            "engine": "google_news",
            "q": competitor,
            "api_key": api_key,
            "num": 20,
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await async_retry_with_backoff(client.get, _SERPAPI_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        articles = data.get("news_results", [])
        normalized = []
        for article in articles:
            title = article.get("title", "")
            snippet = article.get("snippet", "")
            content = f"{title}. {snippet}".strip(". ")
            if not content:
                continue
            normalized.append({
                "id": f"gnews_{hash(article.get('link', title)) & 0xFFFFFF:06x}",
                "content": content,
                "metadata": {
                    "competitor_name": competitor,
                    "signal_source": article.get("link", ""),
                    "title": title,
                    "source": article.get("source", {}).get("name"),
                    "published": article.get("date"),
                    "source_type": "google_news",
                },
            })
        return normalized
