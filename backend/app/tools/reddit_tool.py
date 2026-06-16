"""`search_reddit_signals` — Reddit API, used by the Competitive Signal agent (CLAUDE.md §8).

Searches r/all and product/company subreddits for competitor mentions.
Uses Reddit's OAuth2 app-credentials flow (no user login required).

Credential shape (stored AES-256 encrypted in data_sources.credentials, SR-04):
  {
    "client_id":     str,  — Reddit app client ID (https://www.reddit.com/prefs/apps)
    "client_secret": str,  — Reddit app secret
    "user_agent":    str,  — Required by Reddit TOS: "platform:app_name:version by u/username"
  }
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Type
from uuid import UUID

import httpx
from pydantic import BaseModel, Field

from app.tools.base_tool import DataAutomatedBaseTool, async_retry_with_backoff

logger = logging.getLogger("dataautomated")

_REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
_REDDIT_SEARCH_URL = "https://oauth.reddit.com/search"


async def _get_reddit_token(client_id: str, client_secret: str, user_agent: str) -> str:
    """OAuth2 client-credentials flow — returns a bearer token."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            _REDDIT_TOKEN_URL,
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"User-Agent": user_agent},
        )
    resp.raise_for_status()
    return resp.json()["access_token"]


class RedditSearchInput(BaseModel):
    client_id: UUID = Field(description="Tenant UUID — must match the authenticated client")
    competitors: list[str] = Field(description="List of competitor names to search for")
    since_hours: int = Field(default=48, description="Look back window in hours")


class RedditSignalTool(DataAutomatedBaseTool):
    name: str = "search_reddit_signals"
    description: str = (
        "Search Reddit for competitor mentions, product feedback, and community sentiment. "
        "Returns normalized signal records."
    )
    args_schema: Type[BaseModel] = RedditSearchInput
    category: str = "compsig"
    source_type: str = "reddit"

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
            client_id_str = creds["client_id"]
            client_secret = creds["client_secret"]
            user_agent = creds.get("user_agent", "dataautomated/1.0")

            token = await _get_reddit_token(client_id_str, client_secret, user_agent)

            results = await asyncio.gather(
                *[self._search_competitor(token, user_agent, c, since_hours) for c in competitors],
                return_exceptions=True,
            )

            normalized = []
            for i, res in enumerate(results):
                if isinstance(res, Exception):
                    logger.warning(
                        "Reddit search failed for competitor %r: %s", competitors[i], res
                    )
                    continue
                normalized.extend(res)
            return normalized
        except Exception as exc:
            logger.warning("search_reddit_signals failed for client %s: %s", client_id, exc)
            return []

    async def _search_competitor(
        self,
        token: str,
        user_agent: str,
        competitor: str,
        since_hours: int,
    ) -> list[dict]:
        params = {
            "q": competitor,
            "sort": "new",
            "type": "link",
            "limit": 25,
            "t": "week" if since_hours > 24 else "day",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await async_retry_with_backoff(
                client.get,
                _REDDIT_SEARCH_URL,
                params=params,
                headers={
                    "Authorization": f"Bearer {token}",
                    "User-Agent": user_agent,
                },
            )
        resp.raise_for_status()
        children = resp.json().get("data", {}).get("children", [])

        normalized = []
        for child in children:
            post = child.get("data", {})
            created_utc = post.get("created_utc", 0)
            post_dt = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None
            title = post.get("title", "")
            selftext = post.get("selftext", "")[:500]
            content = f"{title}. {selftext}".strip(". ")
            if not content:
                continue
            normalized.append({
                "id": f"reddit_{post.get('id', '')}",
                "content": content,
                "metadata": {
                    "competitor_name": competitor,
                    "signal_source": f"https://reddit.com{post.get('permalink', '')}",
                    "subreddit": post.get("subreddit_name_prefixed"),
                    "score": post.get("score", 0),
                    "created_at": post_dt.isoformat() if post_dt else None,
                    "source_type": "reddit",
                },
            })
        return normalized
