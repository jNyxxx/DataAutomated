# AGENT_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for the three LangGraph agents — the AI core where the unit of work actually happens. It fixes the shared agent contract and reproduces each agent's node order, state, inputs/outputs, and persistence target exactly as decided.
> **Governing sources:** `CLAUDE.md` §7 (agent architecture — the three agents), §2 (async, observability), §3 (LangGraph/LangSmith/gpt-4o), §6 (tenancy in agents), §16 (testing); `ARCHITECTURE_DECISION_RECORDS.md` ADR-002 (LangGraph), ADR-005 (async exec), §4.1 (stateful graphs theme), §6 ("extend the three agents"); `MASTER_ROADMAP.md` FR-VOC-*, FR-CSE-*, FR-BJI-*, NFR-03, AUD-05/08 (DB access), AUD-09 (ML depth), AUD-11 (injection), RISK-03/04/05.
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (insight tables) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (tenant context) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (dispatch) · [MCP_ARCHITECTURE](MCP_ARCHITECTURE.md) (tools) · [RAG_ARCHITECTURE](RAG_ARCHITECTURE.md) (grounding).
> **Scope boundary:** No agent code as a deliverable. State shapes and node orders are reproduced as *contracts* the P4 implementation realizes.

---

## 1. The cardinal rule

> **There are exactly THREE agents, one per intelligence service.** Claude **extends** these three; it **MUST NOT** create competing agent frameworks, parallel orchestration layers, or a fourth agent without explicit approval. **New capability = a new node or tool inside an existing agent — not a new architecture** (CLAUDE §7; ADR §6).

Each agent is a LangGraph `StateGraph`: nodes are steps, edges are transitions, typed state flows between nodes (ADR-002). Modeling agents as stateful graphs — not one opaque prompt — is what makes steps independently testable, mappable to trace spans, and extensible by insertion (ADR §4.1).

---

## 2. Shared agent contract (CLAUDE §7)

Every agent obeys this contract:

| Element | Rule |
|---|---|
| **State** | A `TypedDict` carrying `client_id` plus working fields (per-agent below). |
| **Graph build** | Explicit `add_node` / `add_edge`, `set_entry_point`, terminating at `END`, then `.compile()`. |
| **Entry point** | The public entry function is `@traceable(name=...)` — the unit LangSmith traces (NFR-03). |
| **LLM** | `ChatOpenAI(model="gpt-4o", temperature=0)` (CLAUDE §3, §7). |
| **Batching/limits** | NLP batching = **20 items/batch**; VoC fetch limit = **500 items** (CLAUDE §7; RISK-03 cost control). |
| **Execution** | Runs **asynchronously**, never inside an HTTP request (ADR-005; BACKEND §6). Dispatched with explicit `client_id`. |
| **Persistence** | Final node persists to the correct insights table and marks source rows `processed` where applicable. |
| **DB access** | Through the shared pool with tenant context set — **no ad-hoc `asyncpg.connect`** (AUD-05/08; §6 below). |
| **Tenancy** | Every tenant query carries `WHERE client_id = $1` *and* runs under `app.current_client_id` (CLAUDE §6). |

> **DEFAULT (scope — D6 / AUD-09 / RISK-14):** NLP/ML depth in MVP is **`gpt-4o` LLM-based extraction**, the sanctioned simplification of the Brief's BERT/RoBERTa/HMM/LSTM promises. Temporal-trend, micro-event, cohort, and behavioral-feedback-linkage depth are **shallow in MVP** and deferred to v1.1 (AUD-09). Make this explicit to stakeholders; do not assume v1.1 enhancement depth in MVP.

---

## 3. The three agents (reproduced from CLAUDE §7.1–7.3)

### 3.1 VoC Agent — `backend/app/agents/voc_agent.py`
**Responsibilities:** ingest unprocessed feedback, run NLP (sentiment/urgency/intent/theme/churn signal), cluster themes, compute churn risk, generate a CEO-grade narrative, decide on a churn alert, persist (CLAUDE §7.1; FR-VOC-01…05).

- **Inputs:** `raw_feedback` rows where `processed = FALSE` (latest 500); optionally RAG context.
- **Outputs:** a `feedback_insights` row (`sentiment_score`, `themes`, `narrative`, `churn_risk`, …); `raw_feedback.processed = TRUE`; a churn-alert webhook to n8n when `alert_required`.
- **State `VoCState`:** `client_id`, `raw_feedback`, `preprocessed`, `sentiment_results`, `theme_clusters`, `churn_risk_score`, `narrative`, `alert_required` (+ `rag_context` once RAG lands).
- **Node order (canonical):** `fetch_feedback` → `nlp_analysis` → `theme_clustering` → (`rag_context`) → `narrative_generation` → `check_alert` → `store_results` → `END`.
- **Key rules:**
  - Churn alert threshold: `alert_required = churn_risk_score > 0.15`. n8n then escalates: `> 0.25` URGENT, `> 0.15` standard early warning (CLAUDE §7.1, §13; FR-VOC-04).
  - NLP node returns **per-item validated JSON**: `sentiment_score (-1.0..1.0)`, `urgency_score (0.0..1.0)`, `primary_theme`, `intent ∈ {complaint, request, praise, question}`, `churn_signal (bool)` (FR-VOC-02; output-schema validation is the injection guard — §7).
  - The RAG node, when present, is inserted **before** `narrative_generation` and injects retrieved context into the prompt (RAG §4).
- **Done-when (P4a):** LangSmith shows successful VoC traces; insights persisted; `raw_feedback` drains; **full run < 60s** (§1.8).

### 3.2 Competitive Signal Agent — `backend/app/agents/comp_signal_agent.py`
**Responsibilities:** fetch tracked competitors, mine multimodal signals via MCP tools, classify/score by type/velocity/relevance, generate strategic context aligned to positioning, flag critical signals, persist (CLAUDE §7.2; FR-CSE-01…05).

- **Inputs:** client competitor config; external signals via MCP tools (`scrape_g2_reviews`, `fetch_linkedin_jobs`, `search_news`, `fetch_patent_filings`, …) (MCP §3).
- **Outputs:** `competitive_signals` rows (`competitor_name`, `signal_type`, `signal_source`, `raw_content`, `strategic_context`, `urgency`); critical signals → real-time alerts via n8n.
- **State `CompSignalState`:** `client_id`, `competitors`, `raw_signals`, `classified_signals`, `strategic_context`, `critical_signals`.
- **Node order:** `fetch_competitors` → `mine_signals` → `classify_signals` → `generate_strategic_context` → `flag_critical` → `store` → `END`.
- **Done-when (P4b):** CompSig traces succeed; signals persisted; **full run < 45s** (§1.8). Consumes MCP tools from P5.

### 3.3 Behavioral Journey Agent — `backend/app/agents/journey_agent.py`
**Responsibilities:** fetch behavioral events, define/reconstruct funnels, compute per-step drop-off, diagnose friction root cause, generate prioritized recommendations with projected lift, persist (CLAUDE §7.3; FR-BJI-01…04).

- **Inputs:** `journey_events` for the client; MCP tools (`fetch_mixpanel_events`, `fetch_segment_events`, `fetch_shopify_events`).
- **Outputs:** `journey_insights` rows (`funnel_step`, `drop_off_rate`, `friction_score`, `friction_cause ∈ {ux_friction, messaging, expectation}`, `recommendation`, `projected_lift`).
- **State `JourneyState`:** `client_id`, `journey_events`, `funnel_steps`, `drop_off_analysis`, `friction_diagnosis`, `recommendations`, `narrative`.
- **Node order:** `fetch_events` → `define_funnels` → `calculate_dropoffs` → `diagnose_friction` → `generate_recommendations` → `store` → `END`.
- **Done-when (P4c):** journey insights persisted; traces succeed.

---

## 4. Node design principles

- **Each node is a pure-ish function of state** → output state. This is what makes per-node unit testing possible before wiring into the graph (ADR §4.1; CLAUDE §16).
- **`fetch_*` nodes are tenant-scoped** (`WHERE client_id = $1 ... LIMIT 500` via the pool helper — §6).
- **NLP/classify nodes return validated structured output** (the injection guard — §7); malformed output is rejected, not trusted.
- **`store` nodes** write to the agent's insights table in one transaction and, for VoC, mark `raw_feedback.processed = TRUE` for the analyzed `feedback_ids`.
- **Extension = insert a node + edge** (e.g., the RAG node), never a rewrite (ADR §4.1; the "extend, don't replace" mechanism).

---

## 5. Observability (NFR-03 / ADR-002 / LangSmith)

- The public entry of each agent is `@traceable(name=...)`; **LangSmith tracing is active on every agent run in every environment** (CLAUDE §2, §7; prod too — INFRASTRUCTURE §3).
- Graph nodes map onto trace spans, so the orchestration model and the debugging model are the same shape (ADR-002 rationale). LangSmith is also the **agent-action audit substrate** (MULTI_TENANT_SECURITY §7; SR-05).
- **Done criterion across P4:** LangSmith shows successful traces for each agent; QA exit requires **0 failed LangSmith runs in 48h** (CLAUDE §16).

---

## 6. DB access from agents (AUD-05 / AUD-08 / RISK-01/02) — binding

> **DESIGN STANDARD:** agents and their nodes/tools acquire DB connections through the **shared pool's tenant-context helper** (`acquire_for_client`, BACKEND §5) — **never** `asyncpg.connect(...)` per node (AUD-05). The pooled connection has `app.current_client_id` set (`SET LOCAL` in a txn), and every tenant query *also* carries `WHERE client_id = $1` (CLAUDE §6; MULTI_TENANT_SECURITY §4.2). This is the agent-side enforcement of the isolation invariant and is covered by the isolation test (MULTI_TENANT_SECURITY §4.3).

Reference (correct, tenant-scoped) fetch — preserve this shape (CLAUDE §6/§7):
```python
rows = await conn.fetch(
    "SELECT id, content FROM raw_feedback "
    "WHERE client_id = $1 AND processed = FALSE LIMIT 500",
    state["client_id"],
)
```

---

## 7. Prompt-injection hardening (AUD-11 / RISK-05) — P4

Feedback and scraped content flow into prompts; treat all of it as untrusted (MULTI_TENANT_SECURITY §8):
- **Instruction isolation / input demarcation:** fence ingested content from system instructions so content cannot pose as an instruction.
- **Output schema validation:** NLP/classify nodes return validated JSON; reject malformed/inconsistent output rather than trusting it (§3.1 per-item schema).
- **No content-driven tool execution:** ingested content can never cause an agent to take an action; actions derive from validated state only.
- **Tool/LLM output is untrusted input**, normalized and validated before use (MCP §5).

---

## 8. Reliability & cost (ADR-005 / AUD-06 / RISK-03/04)

- **Idempotent & broker-portable:** agent entry points are parameterized by `client_id`, hold no in-request state, and are safe to re-run — so lost runs (container restart, AUD-06) are recovered by n8n re-trigger sweeps and a future broker migration is a substitution (ADR-005 future constraint; BACKEND §6; RISK-04).
- **Cost/latency control (RISK-03):** batching (20/batch) and per-run caps (VoC 500 items) are enforced; cheaper models for pure extraction, per-tenant rate limits, and budget alarms are mitigations carried into P4/P6. Runs must meet the §1.8 latency targets.

---

## 9. Testing (CLAUDE §16)

- **Unit-test every node in isolation before wiring** (e.g., `tests/test_voc_agent.py::test_nlp_analysis_returns_sentiment` asserts sentiment sign per item). `pytest` + `pytest.mark.asyncio` (CLAUDE §16; FR-VOC-02 verification).
- **Agent tests:** each node's input→output transformation, plus end-to-end graph runs that persist to the DB.
- **Done criterion:** LangSmith shows successful traces for each agent; every new node/feature has a test (CLAUDE §16 daily checklist).

---

## 10. Verification (P4 cross-cutting exit — MASTER_ROADMAP §5.6)

- All three agents produce successful LangSmith traces (NFR-03); **3 healthy agents**.
- Insights persisted to the correct tables; VoC drains `raw_feedback`; alert webhook fires on threshold (FR-VOC-04).
- Latency: VoC < 60s, CompSig < 45s (§1.8).
- All agents idempotent & broker-portable (RISK-04); batching/limits enforced (RISK-03).
- Agent DB access proven isolated on pooled connections (MULTI_TENANT_SECURITY §4.3; RISK-01).
- Injection hardening in place (AUD-11/RISK-05).

---

*DataAutomated.io — AGENT_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces CLAUDE.md §7; governed by ADR-002/005.*
