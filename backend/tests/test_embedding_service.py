"""
Phase 7 — embedding service tests (CLAUDE.md §16; RAG_ARCHITECTURE.md §2).

Structure:
  1. Unit tests     — mock OpenAI; verify store/retrieve call shapes and result structure
  2. DB integration — real DB, mock OpenAI; verify tenant isolation, result fields, global rows
  3. Performance    — 1000 random vectors via SQL (no OpenAI); retrieve in < 50ms

All DB-dependent tests skip if the database is unreachable.
All OpenAI calls are mocked — tests pass without a live OPENAI_API_KEY.
"""

from __future__ import annotations

import os
import time
import uuid as _uuid
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest

import app.database as _db
from app.config import settings
from app.database import acquire_for_client, close_pool, init_pool

TEST_DB_DSN = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)

# Deterministic fake embedding vector (1536-dim, unit-ish)
_FAKE_VEC: list[float] = [0.01] * 1536


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_pool():
    """Initialize shared pool; skip if DB is unreachable."""
    try:
        await init_pool(dsn=TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}); skipping embedding DB tests.")
    yield
    await close_pool()


@pytest.fixture
async def admin_conn():
    """Superuser direct connection (auto-commit) for seeding and assertions."""
    try:
        conn = await asyncpg.connect(TEST_DB_DSN)
    except Exception as exc:
        pytest.skip(f"Database not available ({exc}).")
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_embedding_mock():
    """Return a mock OpenAIEmbeddings whose aembed_query returns _FAKE_VEC."""
    mock = MagicMock()
    mock.aembed_query = AsyncMock(return_value=_FAKE_VEC)
    return mock


async def _cleanup_embeddings(conn: asyncpg.Connection, *row_ids) -> None:
    if row_ids:
        await conn.execute(
            "DELETE FROM knowledge_embeddings WHERE id = ANY($1)", list(row_ids)
        )


async def _cleanup_client(conn: asyncpg.Connection, client_id) -> None:
    await conn.execute("DELETE FROM knowledge_embeddings WHERE client_id = $1", client_id)
    await conn.execute("DELETE FROM clients WHERE id = $1", client_id)


# ---------------------------------------------------------------------------
# 1. Unit tests — no DB, mock OpenAI
# ---------------------------------------------------------------------------

async def test_store_embedding_calls_aembed_query(monkeypatch):
    """store_embedding calls aembed_query exactly once with the content string."""
    import app.database as _db_mod
    import app.services.embedding_service as svc

    mock_emb = _make_embedding_mock()
    monkeypatch.setattr(svc, "_embeddings", mock_emb)

    # Mock _db.pool since the service accesses it via the module reference
    mock_conn = AsyncMock()
    mock_conn.fetchval = AsyncMock(return_value=_uuid.uuid4())
    mock_pool_ctx = MagicMock()
    mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_pool_ctx)
    monkeypatch.setattr(_db_mod, "pool", mock_pool)

    await svc.store_embedding("test content", client_id=None)

    mock_emb.aembed_query.assert_called_once_with("test content")


async def test_retrieve_similar_calls_aembed_query(monkeypatch):
    """retrieve_similar calls aembed_query exactly once with the query string."""
    import app.database as _db_mod
    import app.services.embedding_service as svc

    mock_emb = _make_embedding_mock()
    monkeypatch.setattr(svc, "_embeddings", mock_emb)

    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_pool_ctx = MagicMock()
    mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_pool_ctx)
    monkeypatch.setattr(_db_mod, "pool", mock_pool)

    results = await svc.retrieve_similar("my query", client_id=None)

    mock_emb.aembed_query.assert_called_once_with("my query")
    assert results == []


async def test_retrieve_similar_result_shape(monkeypatch):
    """retrieve_similar returns dicts with the expected keys in the right types."""
    import app.database as _db_mod
    import app.services.embedding_service as svc

    mock_emb = _make_embedding_mock()
    monkeypatch.setattr(svc, "_embeddings", mock_emb)

    fake_row_id = _uuid.uuid4()
    fake_row = {
        "id": fake_row_id,
        "content": "Industry benchmark: SaaS churn is 3-5%.",
        "client_id": None,
        "metadata": {"source": "benchmark"},
        "similarity_score": 0.92,
    }

    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[fake_row])
    mock_pool_ctx = MagicMock()
    mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_pool_ctx)
    monkeypatch.setattr(_db_mod, "pool", mock_pool)

    results = await svc.retrieve_similar("churn benchmarks", client_id=None, top_k=3)

    assert len(results) == 1
    r = results[0]
    assert r["id"] == str(fake_row_id)
    assert r["content"] == "Industry benchmark: SaaS churn is 3-5%."
    assert r["client_id"] is None
    assert isinstance(r["metadata"], dict)
    assert r["similarity_score"] == pytest.approx(0.92)


async def test_get_embeddings_is_singleton(monkeypatch):
    """_get_embeddings returns the same instance on repeated calls."""
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", None)
    monkeypatch.setattr(settings, "openai_api_key", "test-singleton-key")

    emb1 = svc._get_embeddings()
    emb2 = svc._get_embeddings()
    assert emb1 is emb2


async def test_vec_to_str_format():
    """_vec_to_str produces a valid pgvector literal string."""
    from app.services.embedding_service import _vec_to_str

    result = _vec_to_str([0.1, -0.5, 1.0])
    assert result == "[0.1,-0.5,1.0]"
    assert result.startswith("[") and result.endswith("]")


# ---------------------------------------------------------------------------
# 2. DB integration tests — real DB, mock OpenAI
# ---------------------------------------------------------------------------

async def test_store_and_retrieve_global_embedding(db_pool, admin_conn, monkeypatch):
    """
    store_embedding(client_id=None) inserts a global row;
    retrieve_similar(client_id=None) returns it with the correct shape.
    """
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", _make_embedding_mock())

    row_id = await svc.store_embedding(
        "Global benchmark: SaaS churn is 3-5% monthly.",
        client_id=None,
        metadata={"source": "test", "category": "churn"},
    )

    try:
        # Verify it's in the DB as a global row
        db_row = await admin_conn.fetchrow(
            "SELECT client_id, content FROM knowledge_embeddings WHERE id = $1", row_id
        )
        assert db_row is not None
        assert db_row["client_id"] is None
        assert "SaaS churn" in db_row["content"]

        # retrieve_similar should return it
        results = await svc.retrieve_similar("SaaS churn benchmarks", client_id=None, top_k=5)
        ids = [r["id"] for r in results]
        assert str(row_id) in ids

        # Verify result shape
        match = next(r for r in results if r["id"] == str(row_id))
        assert match["client_id"] is None
        assert isinstance(match["similarity_score"], float)
        assert -1.0 <= match["similarity_score"] <= 1.01  # cosine similarity in [-1,1]; identical fake vecs → ≈1.0
        assert match["metadata"] == {"source": "test", "category": "churn"}

    finally:
        await _cleanup_embeddings(admin_conn, row_id)


async def test_store_and_retrieve_tenant_embedding(db_pool, admin_conn, monkeypatch):
    """
    store_embedding(client_id=<uuid>) inserts a tenant row;
    retrieve_similar(client_id=<uuid>) returns both tenant + global rows for that client.
    """
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", _make_embedding_mock())

    # Seed a client
    client_id = await admin_conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        "Emb Test Client",
        f"emb_test_{str(_uuid.uuid4())[:8]}@test.com",
    )

    try:
        row_id = await svc.store_embedding(
            "Tenant-specific insight: pricing is top concern.",
            client_id=client_id,
            metadata={"source": "insight", "period": "2026-Q1"},
        )

        # Verify DB row has correct client_id
        db_row = await admin_conn.fetchrow(
            "SELECT client_id FROM knowledge_embeddings WHERE id = $1", row_id
        )
        assert str(db_row["client_id"]) == str(client_id)

        # retrieve_similar for this client should return it
        results = await svc.retrieve_similar("pricing concerns", client_id=client_id, top_k=10)
        ids = [r["id"] for r in results]
        assert str(row_id) in ids

        match = next(r for r in results if r["id"] == str(row_id))
        assert match["client_id"] == str(client_id)
        assert isinstance(match["similarity_score"], float)

    finally:
        await _cleanup_client(admin_conn, client_id)


async def test_tenant_isolation_other_client_cannot_see_rows(db_pool, admin_conn, monkeypatch):
    """
    Tenant A's embeddings must not appear in Tenant B's retrieve_similar results.
    Global rows appear for both.
    """
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", _make_embedding_mock())

    suffix = str(_uuid.uuid4())[:8]
    client_a = await admin_conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"Emb Client A {suffix}", f"emb_a_{suffix}@test.com",
    )
    client_b = await admin_conn.fetchval(
        "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
        f"Emb Client B {suffix}", f"emb_b_{suffix}@test.com",
    )

    try:
        # Store one row for A, one global
        a_row_id = await svc.store_embedding(
            "Client A private data: onboarding is top pain.",
            client_id=client_a,
            metadata={"owner": "A"},
        )
        global_row_id = await svc.store_embedding(
            "Global benchmark: NPS median for SaaS is 31.",
            client_id=None,
            metadata={"source": "benchmark"},
        )

        # B can see global row
        b_results = await svc.retrieve_similar("NPS benchmarks", client_id=client_b, top_k=20)
        b_ids = [r["id"] for r in b_results]
        assert str(global_row_id) in b_ids, "B should see global row"

        # B must NOT see A's row
        assert str(a_row_id) not in b_ids, "B must not see A's private row (tenant isolation failure)"

        # A can see both A's row and global row
        a_results = await svc.retrieve_similar("onboarding pain", client_id=client_a, top_k=20)
        a_ids = [r["id"] for r in a_results]
        assert str(a_row_id) in a_ids, "A should see its own row"
        assert str(global_row_id) in a_ids, "A should also see global row"

    finally:
        await _cleanup_client(admin_conn, client_a)
        await _cleanup_client(admin_conn, client_b)
        # Clean up global row separately (no client_id cascade)
        await _cleanup_embeddings(admin_conn, global_row_id)


async def test_retrieve_similar_top_k_respected(db_pool, admin_conn, monkeypatch):
    """retrieve_similar respects the top_k limit."""
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", _make_embedding_mock())

    # Insert 10 global rows with same vector (will all have same similarity)
    ids_to_clean = []
    for i in range(10):
        vec_str = "[" + ",".join(["0.01"] * 1536) + "]"
        row_id = await admin_conn.fetchval(
            "INSERT INTO knowledge_embeddings (content, embedding) "
            "VALUES ($1, $2::vector) RETURNING id",
            f"Batch entry {i}",
            vec_str,
        )
        ids_to_clean.append(row_id)

    try:
        results = await svc.retrieve_similar("some query", client_id=None, top_k=3)
        assert len(results) <= 3
    finally:
        await _cleanup_embeddings(admin_conn, *ids_to_clean)


async def test_retrieve_similar_ordered_by_similarity(db_pool, admin_conn, monkeypatch):
    """Results must be ordered by similarity_score descending."""
    import app.services.embedding_service as svc

    monkeypatch.setattr(svc, "_embeddings", _make_embedding_mock())

    # Insert two global rows: one identical to query vector (cosine=1), one antiparallel (cosine=-1)
    identical_vec = "[" + ",".join(["0.01"] * 1536) + "]"
    antiparallel_vec = "[" + ",".join(["-0.01"] * 1536) + "]"

    ids_to_clean = []
    for v, label in [(identical_vec, "identical"), (antiparallel_vec, "antiparallel")]:
        row_id = await admin_conn.fetchval(
            "INSERT INTO knowledge_embeddings (content, embedding) "
            "VALUES ($1, $2::vector) RETURNING id",
            f"Order test {label}",
            v,
        )
        ids_to_clean.append(row_id)

    try:
        results = await svc.retrieve_similar("query", client_id=None, top_k=2)
        if len(results) >= 2:
            assert results[0]["similarity_score"] >= results[1]["similarity_score"], (
                "Results must be ordered by similarity descending"
            )
    finally:
        await _cleanup_embeddings(admin_conn, *ids_to_clean)


# ---------------------------------------------------------------------------
# 3. Performance test — SQL-seeded random vectors, no OpenAI
# ---------------------------------------------------------------------------

async def test_retrieval_performance_1000_embeddings(admin_conn):
    """
    Retrieval from 1000 embeddings must complete in < 50ms (CLAUDE.md §16 performance target).
    Uses PostgreSQL-generated random vectors per row — no OpenAI call required.
    Diverse per-row vectors exercise the ivfflat index under realistic (non-trivial) conditions.
    """
    import random as _rand
    _rand.seed(42)

    # Clean up any orphaned rows from a prior failed run
    await admin_conn.execute(
        "DELETE FROM knowledge_embeddings WHERE content LIKE 'perf_test_%'"
    )

    # Seed 1000 global rows with unique random vectors (server-side random() per row)
    await admin_conn.execute(
        "INSERT INTO knowledge_embeddings (content, embedding) "
        "SELECT 'perf_test_' || gs::text, "
        "       CAST('[' || ("
        "           SELECT string_agg(round(random()::numeric, 6)::text, ',')"
        "           FROM generate_series(1, 1536)"
        "       ) || ']' AS vector) "
        "FROM generate_series(1, 1000) AS gs"
    )

    # Random probe vector (distinct from stored vectors — exercises the index honestly)
    probe = [_rand.uniform(-1.0, 1.0) for _ in range(1536)]
    probe_str = "[" + ",".join(f"{v:.6f}" for v in probe) + "]"

    try:
        start = time.perf_counter()
        rows = await admin_conn.fetch(
            "SELECT id, 1 - (embedding <=> $1::vector) AS similarity_score "
            "FROM knowledge_embeddings "
            "WHERE client_id IS NULL "
            "ORDER BY embedding <=> $1::vector "
            "LIMIT 5",
            probe_str,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert len(rows) == 5, f"Expected 5 results, got {len(rows)}"
        assert elapsed_ms < 50, (
            f"Retrieval took {elapsed_ms:.2f}ms — exceeds 50ms target "
            f"(check ivfflat index on knowledge_embeddings)"
        )

    finally:
        await admin_conn.execute(
            "DELETE FROM knowledge_embeddings WHERE content LIKE 'perf_test_%'"
        )
