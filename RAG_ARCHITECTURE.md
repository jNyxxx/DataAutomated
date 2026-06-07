# RAG_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for retrieval-augmented grounding — how agents become context-aware so their narratives read like they come from someone who knows the client's business. One service, one model, one retrieval path.
> **Governing sources:** `CLAUDE.md` §9 (RAG system design), §3 (OpenAI embeddings/pgvector), §5 (`knowledge_embeddings` schema); `ARCHITECTURE_DECISION_RECORDS.md` ADR-010 (central embedding service), ADR-003 (unified store), §4.5 (interpretation theme); `MASTER_ROADMAP.md` OR-05, DR-03, RISK-09 (pgvector ceiling), and the RAG-enrichment of FR-VOC-05 / FR-CSE-04.
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (`knowledge_embeddings`) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) (`rag_context` node) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (tenant+global retrieval).
> **Scope boundary:** No embedding-service code as a deliverable. This fixes the contracts and rules the P7 implementation realizes.

---

## 1. Why RAG, and the cardinal rule (ADR-010)

Agent narratives must be grounded in prior context — a client's earlier analyses, industry benchmarks, playbook guidance — and that retrieval is always **tenant-aware** (a client's own knowledge plus shared global knowledge). If each agent embedded and retrieved on its own, the system would risk multiple embedding models, inconsistent dimensions, and divergent retrieval semantics, making results incomparable and the knowledge base internally inconsistent (ADR-010 context). The decision: **one central embedding service owns the single model and the single retrieval path.**

> **RULE:** Claude **MUST reuse the central embedding service** for all RAG. **No duplicate RAG implementations, no second embedding model, no parallel vector store.** Agents call `retrieve_similar` — they do not embed or query vectors directly (CLAUDE §9; ADR-010; PROJECT_STRUCTURE §8 anti-pattern).

This is also why interpretation is a first-class concern: grounding is infrastructure, not a prompt-engineering detail, so every narrative is **explainable** by the context it retrieved (ADR §4.5).

---

## 2. The central embedding service (single source of truth)

`backend/app/services/embedding_service.py` is the **one and only** place embeddings are created, stored, and retrieved (CLAUDE §9; PROJECT_STRUCTURE §3). It exposes exactly two operations:

```
store_embedding(content, client_id=None, metadata={})        # client_id=None -> global knowledge
retrieve_similar(query, client_id=None, top_k=5)             # tenant + global, cosine, top_k default 5
```

- **Embeddings:** `OpenAIEmbeddings(model="text-embedding-3-small")` → **1536-dim** vectors (CLAUDE §9; matches `vector(1536)`).
- **Storage:** the `knowledge_embeddings` table; ivfflat cosine index (`lists = 100`) (DATABASE_FOUNDATION §3; DR-03).
- DB access through the shared pool (BACKEND §5); writes/reads respect tenancy (§3).

---

## 3. Retrieval semantics (tenant + global)

- **Cosine similarity via `<=>`** (the pgvector cosine-distance operator); default **`top_k = 5`** (CLAUDE §9).
- **Query searches client-specific + global knowledge:** `WHERE (client_id = $2 OR client_id IS NULL)` (CLAUDE §9). This is why `knowledge_embeddings.client_id` is **nullable** (NULL = global) — the one deliberate tenancy exception (DATABASE_FOUNDATION §2/§4).
- **Tenancy guarantee:** retrieval returns a client's own rows + global rows only — **never another client's rows** (CLAUDE §9; MULTI_TENANT_SECURITY §3). If RLS is extended to `knowledge_embeddings` (recommended, flagged), its policy must admit `client_id IS NULL` global rows so this query still works (MULTI_TENANT_SECURITY §3).

Conceptual retrieval shape (illustrative):
```sql
SELECT content, metadata
FROM knowledge_embeddings
WHERE (client_id = $2 OR client_id IS NULL)
ORDER BY embedding <=> $1        -- $1 = query embedding (1536-d)
LIMIT $3;                        -- top_k, default 5
```

---

## 4. Integration into agents (the insertion pattern)

RAG is added by **insertion, not rewrite** (ADR §4.1; AGENT §4):
- Add a **`rag_context_node` BEFORE `narrative_generation_node`** in the VoC graph (and analogously where CompSig builds `strategic_context`) (CLAUDE §9; AGENT §3.1).
- The node calls `retrieve_similar(query, client_id, top_k=5)`, stores the retrieved text on state as **`rag_context`**, and the narrative prompt **injects** that context.
- Agents are **functional without RAG** — the narrative works first (FR-VOC-05), and RAG **enriches** it — so RAG is a **soft** dependency, off the critical path to "agents run" (MASTER_ROADMAP §4.2; IMPLEMENTATION_SEQUENCE).

This enriches FR-VOC-05 (VoC narrative) and FR-CSE-04 (CompSig strategic context).

---

## 5. Approved knowledge sources (seed on day one — CLAUDE §9)

Only these source categories may be ingested into the knowledge base; new categories require approval (CLAUDE §9):
- Past client insight reports (chunked ~500 tokens each).
- Industry benchmark data (churn rates, NPS benchmarks by industry).
- Common theme taxonomy (standardized theme descriptions).
- Competitor profiles (for CompSig context).
- Playbook entries (e.g. *"When churn risk > 20% and top theme is pricing, the recommended response is…"*).

> **RULE:** Only ingest approved source types. Client reports are stored with `client_id` set; benchmarks/taxonomy/playbooks are typically **global** (`client_id = NULL`). Retrieval respects tenancy regardless (§3).

---

## 6. Scalability & explainability (RISK-09 / ADR §4.5)

- **Index tuning (RISK-09):** ivfflat `lists = 100` is the fixed start; recall/latency are monitored as vector volume grows; `lists` tuning and a possible future extraction to a dedicated ANN store are pre-considered, not built (ADR-003 consequence; DATABASE_FOUNDATION §9). Extraction would require re-solving tenant isolation in that store first (ADR-010 future constraint) — the cost of today's simplicity.
- **Model inertia:** the embedding model is a **system-wide commitment**; changing it is a global migration (all vectors must be re-embedded to stay comparable), so it is a deliberate, versioned decision (ADR-010 future constraint).
- **Explainability/audit:** because all grounding flows through one path, every narrative can be traced to the specific retrieved context that informed it — grounding is auditable, complementing the LangSmith trace (ADR-010 rationale; MULTI_TENANT_SECURITY §7).

---

## 7. Verification (P7 done-when — MASTER_ROADMAP §5.9)

- The VoC narrative references retrieved context (FR-VOC-05 enriched).
- **No duplicate RAG path exists** — one service, one model, one vector store (OR-05; the §1 rule).
- A similarity query returns sensible results; the ivfflat index is present (DR-03).
- Retrieval returns client + global rows only; never another tenant's rows (MULTI_TENANT_SECURITY §3).
- The `rag_context` node sits **before** narrative generation (AGENT §3.1).

---

*DataAutomated.io — RAG_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces CLAUDE.md §9; governed by ADR-010/003.*
