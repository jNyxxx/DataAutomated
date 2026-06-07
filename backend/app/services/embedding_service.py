"""
Central embedding service — the ONE AND ONLY place embeddings are created, stored, and
retrieved (CLAUDE.md §9, ADR-010). No duplicate RAG, no second model, no parallel vector store.

Stub — implemented in Phase 7 (RAG_ARCHITECTURE.md §2). Public surface:
  store_embedding(content, client_id=None, metadata={})
  retrieve_similar(query, client_id=None, top_k=5)   # tenant + global; cosine `<=>`
Model: text-embedding-3-small (1536-dim).
"""
