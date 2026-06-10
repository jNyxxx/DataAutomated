"""
Central embedding service — the ONE AND ONLY place embeddings are created, stored, and
retrieved (CLAUDE.md §9; ADR-010; RAG_ARCHITECTURE.md §2).

Public API:
  store_embedding(content, client_id=None, metadata=None) -> UUID
  retrieve_similar(query, client_id=None, top_k=5)        -> list[dict]

Model: text-embedding-3-small (1536-dim). No other embedding model, no parallel vector store.
Tenancy: retrieve_similar returns client-specific + global (NULL client_id) rows when
         client_id is given; global-only rows when client_id is None.
DB access: acquire_for_client for tenant reads/writes; raw pool.acquire for global-only
           writes (FORCE RLS + client_id IS NULL branch admits these without tenant context).
Vectors passed as '$1::vector' strings — no codec registration required.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Optional
from uuid import UUID

from langchain_openai import OpenAIEmbeddings

import app.database as _db
from app.config import settings
from app.database import acquire_for_client

logger = logging.getLogger("dataautomated")

_embeddings: Optional[OpenAIEmbeddings] = None
_use_mock = os.getenv("EMBEDDING_USE_MOCK", "").lower() == "true"


def _get_embeddings() -> OpenAIEmbeddings:
    """Singleton OpenAIEmbeddings. Never instantiated outside this module (CLAUDE.md §9)."""
    global _embeddings
    if _embeddings is None:
        _embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=settings.openai_api_key,
        )
    return _embeddings


def _generate_mock_embedding(text: str) -> list[float]:
    """
    Deterministic mock embedding (1536-dim) for development when OpenAI quota exhausted.
    Uses SHA256 hash of input to generate stable, reproducible vectors.
    Not for production use — activates only when EMBEDDING_USE_MOCK=true or OpenAI fails.
    """
    h = hashlib.sha256(text.encode()).digest()
    # Use hash bytes to seed a deterministic sequence
    vector = []
    for i in range(1536):
        byte_idx = i % 32
        bit_shift = (i // 32) % 8
        val = (h[byte_idx] >> bit_shift) & 1
        # Map bit to [-1, 1] with some structure
        normalized = (val * 2 - 1) * (0.1 + 0.9 * ((i % 256) / 256))
        vector.append(normalized)
    # Normalize to unit length for cosine similarity
    norm = sum(v**2 for v in vector) ** 0.5
    return [v / (norm + 1e-8) for v in vector]


def _vec_to_str(vector: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in vector) + "]"


async def store_embedding(
    content: str,
    client_id: Optional[UUID] = None,
    metadata: Optional[dict] = None,
) -> UUID:
    """
    Embed content and persist to knowledge_embeddings.

    client_id=None  → global row (client_id NULL); visible to all tenants via retrieve_similar.
    client_id=<uuid> → tenant-specific row; visible only for that tenant's queries.

    Falls back to mock embeddings if EMBEDDING_USE_MOCK=true or OpenAI quota exhausted.
    Returns the UUID of the inserted row.
    """
    # Try real OpenAI embedding; fall back to mock if quota exhausted
    if _use_mock:
        vector = _generate_mock_embedding(content)
        logger.warning('{"event": "embedding.mock_used", "reason": "EMBEDDING_USE_MOCK=true"}')
    else:
        try:
            emb = _get_embeddings()
            vector = await emb.aembed_query(content)
        except Exception as e:
            if "429" in str(e) or "insufficient_quota" in str(e).lower():
                logger.warning(
                    '{"event": "embedding.fallback_to_mock", "reason": "openai_quota_exhausted", "error": "%s"}',
                    str(e)[:200],
                )
                vector = _generate_mock_embedding(content)
            else:
                raise

    vec_str = _vec_to_str(vector)
    meta_json = json.dumps(metadata or {})

    if client_id is None:
        if _db.pool is None:
            raise RuntimeError("Database pool is not initialized.")
        async with _db.pool.acquire() as conn:
            row_id: UUID = await conn.fetchval(
                "INSERT INTO knowledge_embeddings (content, embedding, metadata) "
                "VALUES ($1, $2::vector, $3::jsonb) RETURNING id",
                content,
                vec_str,
                meta_json,
            )
    else:
        async with acquire_for_client(client_id) as conn:
            row_id = await conn.fetchval(
                "INSERT INTO knowledge_embeddings (client_id, content, embedding, metadata) "
                "VALUES ($1, $2, $3::vector, $4::jsonb) RETURNING id",
                client_id,
                content,
                vec_str,
                meta_json,
            )

    logger.info(
        '{"event": "embedding.stored", "client_id": "%s", "id": "%s"}',
        str(client_id) if client_id else "global",
        str(row_id),
    )
    return row_id


async def retrieve_similar(
    query: str,
    client_id: Optional[UUID] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Retrieve top_k embeddings most similar to query via cosine distance.

    client_id given: returns tenant-specific rows + global rows (RLS policy + explicit WHERE
                     both enforce this boundary — belt-and-suspenders per CLAUDE.md §6).
    client_id=None:  returns global rows only.
    Results ordered by similarity descending (most similar first).
    Each result: {id, content, client_id, metadata, similarity_score}.
    """
    if _use_mock:
        logger.warning('{"event": "embedding.mock_used", "reason": "EMBEDDING_USE_MOCK=true", "op": "retrieve"}')
        vector: list[float] = _generate_mock_embedding(query)
    else:
        try:
            emb = _get_embeddings()
            vector = await emb.aembed_query(query)
        except Exception as e:
            if "429" in str(e) or "insufficient_quota" in str(e).lower():
                logger.warning(
                    '{"event": "embedding.fallback_to_mock", "reason": "openai_quota_exhausted", "op": "retrieve"}',
                )
                vector = _generate_mock_embedding(query)
            else:
                raise
    vec_str = _vec_to_str(vector)

    if client_id is None:
        if _db.pool is None:
            raise RuntimeError("Database pool is not initialized.")
        async with _db.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, content, client_id, metadata, "
                "1 - (embedding <=> $1::vector) AS similarity_score "
                "FROM knowledge_embeddings "
                "WHERE client_id IS NULL "
                "ORDER BY embedding <=> $1::vector "
                "LIMIT $2",
                vec_str,
                top_k,
            )
    else:
        async with acquire_for_client(client_id) as conn:
            rows = await conn.fetch(
                "SELECT id, content, client_id, metadata, "
                "1 - (embedding <=> $1::vector) AS similarity_score "
                "FROM knowledge_embeddings "
                "WHERE (client_id = $2 OR client_id IS NULL) "
                "ORDER BY embedding <=> $1::vector "
                "LIMIT $3",
                vec_str,
                client_id,
                top_k,
            )

    results = []
    for row in rows:
        meta = row["metadata"]
        if isinstance(meta, str):
            meta = json.loads(meta)
        results.append({
            "id": str(row["id"]),
            "content": row["content"],
            "client_id": str(row["client_id"]) if row["client_id"] else None,
            "metadata": meta or {},
            "similarity_score": float(row["similarity_score"]),
        })
    return results
