"""
Base tool for the MCP tool layer (CLAUDE.md §8; MCP_ARCHITECTURE.md §2;
PROJECT_STRUCTURE.md §4).

Provides:
  DataAutomatedBaseTool  — abstract base class all MCP tools must subclass
  async_retry_with_backoff — shared retry/backoff primitive (no tenacity dep)

Design constraints (CLAUDE.md §2, §6, §14; MULTI_TENANT_SECURITY §4):
  - Credentials are fetched via _load_credentials, which acquires the DB connection,
    runs one SELECT, then releases the connection BEFORE any HTTP call.  Never hold a
    pool connection across a vendor API call (Prime Directive: must scale to 500 clients).
  - Decrypted credentials are used inline in _arun and never stored on self, logged,
    or returned in any form (SR-04).
  - _run raises NotImplementedError — all tools are async-only (CLAUDE.md §2).

Deviation note: CLAUDE.md §8 shows a synchronous get_tools_for_client.  DB access
requires async; registry.py is async accordingly (mirrors database.py deviation note).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

import httpx
from cryptography.fernet import InvalidToken
from langchain_core.tools import BaseTool

from app.database import acquire_for_client
from app.services.credential_encryption import decrypt_credentials

logger = logging.getLogger("dataautomated")

# Status codes that warrant a retry (transient failures or rate limits).
# Permanent errors (401, 403, 404, 422) are NOT retried — they represent
# configuration or auth problems that retrying cannot fix.
_RETRYABLE_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})


async def async_retry_with_backoff(
    coro_fn: Any,
    *args: Any,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    retryable_status: frozenset[int] = _RETRYABLE_STATUS,
    **kwargs: Any,
) -> httpx.Response:
    """
    Call coro_fn(*args, **kwargs) with exponential backoff on transient failures.

    Retryable: HTTP 429/5xx, httpx.TimeoutException, httpx.TransportError.
    Non-retryable: 2xx success or permanent 4xx (except 429) — returns immediately.

    Delays: 1 s after attempt 0, 2 s after attempt 1 (3 attempts total).
    Fits within the 30 s per-tool timeout budget and the <45 s CompSig benchmark.
    """
    for attempt in range(max_attempts):
        is_last = attempt == max_attempts - 1
        try:
            response: httpx.Response = await coro_fn(*args, **kwargs)
            if response.status_code not in retryable_status:
                return response
            if is_last:
                response.raise_for_status()
            await asyncio.sleep(base_delay * (2 ** attempt))
        except (httpx.TimeoutException, httpx.TransportError):
            if is_last:
                raise
            await asyncio.sleep(base_delay * (2 ** attempt))
    raise RuntimeError("async_retry_with_backoff: exhausted without returning")  # pragma: no cover


class DataAutomatedBaseTool(BaseTool):
    """
    Abstract base for all DataAutomated MCP tools (CLAUDE.md §8; MCP_ARCHITECTURE.md §2).

    Subclasses must declare these as class-level Pydantic field defaults:
      name:        tool identifier (fetch_* | scrape_* | search_*)
      description: one-line description used by LangChain
      category:    "voc" | "compsig" | "journey"  (registry category filter)
      source_type: matches data_sources.source_type exactly (e.g. "zendesk")
      args_schema: Pydantic model; client_id: UUID must always be an explicit field

    Normalization contract: _arun must return list[{"id": str, "content": str, "metadata": dict}].
    """

    category: str = ""
    source_type: str = ""

    def _run(self, **kwargs: Any) -> Any:
        raise NotImplementedError("Use arun — all DataAutomated tools are async only.")

    async def _arun(self, **kwargs: Any) -> list[dict]:
        raise NotImplementedError("Subclasses must implement _arun.")

    async def _load_credentials(self, client_id: UUID) -> dict:
        """
        Fetch and decrypt per-client credentials from data_sources (SR-04).

        Tenant isolation: acquire_for_client sets RLS + app.current_client_id;
        the explicit WHERE client_id = $1 is belt-and-suspenders (CLAUDE.md §6).

        DB connection is acquired, used for one SELECT, then released — fully
        closed before any HTTP call begins.

        Raises ValueError (not InvalidToken) so the exception chain never
        surfaces key material to caller logs.
        """
        try:
            async with acquire_for_client(client_id) as conn:
                row = await conn.fetchrow(
                    "SELECT credentials FROM data_sources "
                    "WHERE client_id = $1 AND source_type = $2 AND is_active = TRUE",
                    client_id,
                    self.source_type,
                )
            if row is None:
                raise ValueError(
                    f"No active {self.source_type} data source for client {client_id}"
                )
            cred_raw = row["credentials"]
            # asyncpg may return JSONB as dict or as a JSON string — guard both
            # (same pattern used in fetch_competitors_node in comp_signal_agent.py).
            payload = json.loads(cred_raw) if isinstance(cred_raw, str) else cred_raw
            return decrypt_credentials(payload)
        except InvalidToken as exc:
            raise ValueError(
                f"Credential decryption failed for {self.source_type} (client {client_id})"
            ) from exc
