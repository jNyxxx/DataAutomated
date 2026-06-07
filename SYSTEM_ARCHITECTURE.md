# SYSTEM_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The system-level blueprint — the tiers, how data flows between them, and the invariants every tier upholds. This is the map the other ten architecture documents zoom into.
> **Governing sources:** `CLAUDE.md` §1, §2, §7, §10, §12, §15, §18, §19; `ARCHITECTURE_DECISION_RECORDS.md` ADR-001…012, §4 (cross-cutting themes), §5 (textual diagram), §6 (design principles); `MASTER_ROADMAP.md` §2 (audit), §3 (risks), §4 (dependency graph).
> **Sibling documents:** [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) · [MCP_ARCHITECTURE](MCP_ARCHITECTURE.md) · [RAG_ARCHITECTURE](RAG_ARCHITECTURE.md) · [FRONTEND_ARCHITECTURE](FRONTEND_ARCHITECTURE.md) · [INFRASTRUCTURE_ARCHITECTURE](INFRASTRUCTURE_ARCHITECTURE.md) · [IMPLEMENTATION_SEQUENCE](IMPLEMENTATION_SEQUENCE.md)

---

## 0. How to read this document

This document does not introduce new decisions. It **composes** the decisions already fixed in `CLAUDE.md` (the *what/how*) and argued in `ARCHITECTURE_DECISION_RECORDS.md` (the *why*) into one coherent picture of the running system, then hands each region of that picture to a sibling document. Every claim here carries a citation to its governing source. Where the source documents left a decision open, this blueprint **commits to the `MASTER_ROADMAP.md` recommended default and flags it** — those flags are collected in §8 and repeated in the document that owns the decision.

The **Prime Directive** governs every judgment call (CLAUDE §0): *"Will this hold up at 100 clients? At 500? If the answer is no, redesign it now."*

---

## 1. What the system is, architecturally

DataAutomated.io is an **AI-native, multi-tenant intelligence platform** (CLAUDE §1; ADR §1). The architecturally decisive fact is that **the unit of work is an AI computation**, not a CRUD transaction: three long-running agent pipelines continuously ingest heterogeneous external data, run multi-step LLM/ML analysis, and persist *interpreted* output — narratives, strategic context, prioritized recommendations — rather than raw data (ADR §1; CLAUDE §1, §2 "store derived insights, not raw customer source data").

Five **forcing functions** (ADR §1) shape every tier. They are the lens for all five §18 engineering gates:

| # | Forcing function | Primary architectural consequence | Governing ADRs |
|---|---|---|---|
| 1 | **Agent latency (5–30s/run)** | Async-first everywhere; agents off the request path; push-based real-time | ADR-001, ADR-005, ADR-012 |
| 2 | **Scale mandate (100→500+ clients)** | Stateless, horizontally scalable compute; one well-understood data tier | ADR-008, ADR-003 |
| 3 | **Hard tenant isolation** | Isolation enforced at the lowest layer (DB/RLS), app scoping as redundancy | ADR-004, ADR-003 |
| 4 | **Heterogeneous, unstable external sources** | Uniform tool boundary quarantines integration churn | ADR-009 |
| 5 | **Observability & auditability** | Tracing + audit trail are first-class, not afterthoughts | ADR-002 (LangSmith), ADR-004, CLAUDE §14 |

---

## 2. The tier model

The system is **seven logical tiers** on **stateless, autoscaling container compute** with exactly **one stateful exception** (the n8n orchestration layer). This expands ADR §5's textual diagram.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 0. EXTERNAL DATA SOURCES                                                   │
│    Support (Zendesk/Intercom), surveys (Typeform), analytics (Mixpanel/    │
│    Segment/Shopify), reviews (G2/Capterra), news, jobs, patents.           │
│    FORCE #4. Reached ONLY through the MCP tool boundary (tier 3).          │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │ pulled on schedule / by event
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. ORCHESTRATION & DELIVERY (n8n)            [ADR-006] — STATEFUL, 1 task  │
│    Decides WHEN to act and WHERE results go. Schedules sweeps, loops over  │
│    clients, calls FastAPI endpoints, routes alerts/reports (Slack/Resend). │
│    DOES NO AI WORK. → owned by INFRASTRUCTURE_ARCHITECTURE (workflows).    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │ HTTP triggers / webhooks (STABLE CONTRACT)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. APPLICATION TIER (FastAPI, async)   [ADR-001/005/011/004] — stateless   │
│    Authenticate (verify JWT, carry tenant claim) → set app.current_client_ │
│    id → ACCEPT work fast (<100ms) and dispatch to background → return.     │
│    Reads serve latest persisted results. Hosts the SSE stream.             │
│    → owned by BACKEND_ARCHITECTURE.                                        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │ in-process background dispatch (decoupled)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. AGENT TIER (LangGraph StateGraphs)   [ADR-002, ADR-009] — stateless     │
│    Exactly THREE agents: VoC · Competitive Signal · Behavioral Journey.    │
│    fetch → analyze → ground(RAG) → interpret → decide → persist.           │
│    Reach the outside world only via the MCP tool boundary.                 │
│    @traceable in LangSmith on every run. → owned by AGENT_ARCHITECTURE     │
│    (graphs), MCP_ARCHITECTURE (tools).                                     │
└──────────────┬───────────────────────────────────┬───────────────────────┘
               │ tenant-scoped reads/writes         │ grounding lookups
               ▼                                     ▼
┌──────────────────────────────────────┐  ┌─────────────────────────────────┐
│ 4. UNIFIED STORE                      │  │ 5. RAG / EMBEDDING SERVICE      │
│    PostgreSQL 16 + pgvector           │◄─┤    ONE model, ONE retrieval path│
│    Relational + vector in ONE         │  │    text-embedding-3-small,      │
│    tenancy-governed store. RLS +      │  │    tenant+global retrieval.     │
│    client_id scoping. [ADR-003/004]   │  │    [ADR-010] → RAG_ARCHITECTURE │
│    → DATABASE_FOUNDATION,             │  └─────────────────────────────────┘
│      MULTI_TENANT_SECURITY            │
└──────────────┬───────────────────────┘
               │ interpreted insights persisted as first-class records
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. PRESENTATION (Next.js, server-first) + PUSH (SSE)  [ADR-007, ADR-012]   │
│    Fetch tenant data server-side; tokens stay off the browser. Notify the  │
│    client on agent completion via SSE — no client polling.                 │
│    → owned by FRONTEND_ARCHITECTURE.                                       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │ threshold events flow back out (webhook)
                                 ▼
        back to tier 1 (n8n) → ALERTS / DELIVERY (Slack #channels, Resend email)

ALL TIERS containerized on AWS ECS Fargate; stateless tiers autoscale.
The single stateful exception is tier 1 (n8n, 1 task + persistent EFS). [ADR-008]
→ owned by INFRASTRUCTURE_ARCHITECTURE.
```

Read as a sentence (ADR §5): *external data is pulled in by orchestration, accepted quickly and tenant-scoped by the application tier, processed asynchronously by inspectable agent graphs that reach the outside world only through a uniform tool boundary and ground their output through a single retrieval path, persisted as interpreted records in one tenancy-governed store, surfaced server-first and pushed to clients on completion, with time-sensitive findings delivered back out at the edge — all on stateless, autoscaling compute.*

---

## 3. Component responsibility map

| Tier | Component | Owns | Must NOT | Governing | Detailed in |
|---|---|---|---|---|---|
| 1 | n8n | Scheduling, client fan-out, endpoint calls, conditional routing, Slack/Resend delivery | Any analysis/insight logic; agent orchestration | ADR-006; CLAUDE §13 | INFRASTRUCTURE |
| 2 | FastAPI app | Auth boundary, tenant-context set, request validation, background dispatch, read endpoints, SSE stream | Block on an agent run; cross-tenant access; leak secrets/tenant data | ADR-001/005/011; CLAUDE §10 | BACKEND |
| 2/4 | Connection pool + tenant-context helper | Hand out DB connections with `app.current_client_id` already set | Hand out a tenant-data connection without tenant context (AUD-08) | ADR-004; AUD-05/08 | MULTI_TENANT_SECURITY, BACKEND |
| 3 | LangGraph agents (×3) | Multi-step AI analysis; persist insights; mark source processed; fire alert webhooks | Run in-request; call vendor APIs directly; create a 4th agent architecture | ADR-002; CLAUDE §7 | AGENT |
| 3 | MCP tools | Uniform per-client access to external sources; decrypt creds; normalize output | Be called inline outside the registry; touch unconnected sources | ADR-009; CLAUDE §8 | MCP |
| 4 | PostgreSQL + pgvector | Relational + vector storage; RLS enforcement; insights as the durable record | Store raw customer data long-term; let vectors escape the tenancy boundary | ADR-003/004; CLAUDE §5, §14 | DATABASE_FOUNDATION |
| 5 | Embedding service | The single embed/retrieve path; tenant+global grounding | A second model, a duplicate RAG path, a parallel vector store | ADR-010; CLAUDE §9 | RAG |
| 6 | Next.js portal | Server-first rendering of tenant data; SSE consumption | Push tokens/raw payloads to the browser; client-poll for real-time | ADR-007/012; CLAUDE §11, §12 | FRONTEND |
| all | ECS Fargate platform | Reproducible containers; autoscaling stateless tiers; managed data services | Run stateful services as multi-task without rework | ADR-008; CLAUDE §15 | INFRASTRUCTURE |

---

## 4. The four canonical data flows

### 4.1 Trigger → background → persist → push (the core latency flow)
`n8n schedule` **or** authenticated client → `POST /api/agents/{service}/run` → app sets tenant context, enqueues the agent as a background task, **returns `< 100ms`** with an acknowledgment (ADR-005; CLAUDE §10; NFR-02) → agent runs 5–30s off the request path, grounds via RAG, persists to the service's insights table, marks source rows processed → the SSE generator detects the new row and pushes it → the portal prepends + toasts (ADR-012; CLAUDE §12). **No HTTP request ever blocks on an agent run** (CLAUDE §2, §20).

### 4.2 Ingestion decoupled from analysis (backpressure flow)
External data lands on the *source's* schedule (n8n ingestion sweep → `POST /api/ingest/trigger` → `raw_feedback` rows with `processed = FALSE`). Analysis runs on the *system's* schedule (a separate VoC sweep). The `processed` boolean is the explicit handoff boundary; unprocessed work simply accumulates and is drained, giving natural backpressure rather than overwhelming the analysis tier (ADR §4.2). The daily checklist watches that `raw_feedback` is draining (CLAUDE §16).

### 4.3 Grounding flow (RAG)
Inside an agent graph, a `rag_context_node` placed **before** `narrative_generation` calls the central embedding service's `retrieve_similar(query, client_id, top_k=5)`, which searches client-specific **plus** global knowledge (`WHERE client_id = $2 OR client_id IS NULL`) and injects the result into the narrative prompt (ADR-010; CLAUDE §9). One model, one path → every narrative is explainable by the context it retrieved.

### 4.4 Outbound delivery flow (alerts/reports)
Threshold events flow back out through n8n: VoC fires a churn-alert webhook when `churn_risk > 0.15`; n8n escalates `> 0.25` URGENT vs `> 0.15` standard (CLAUDE §7.1, §13). Critical competitive signals route to Slack `#client-alerts` + Resend email. Weekly reports render to PDF → S3 → Resend with a download link. Delivery lives at the edge so its failures don't destabilize the analysis core (ADR §4.4).

---

## 5. System-wide invariants (the eight design principles)

These are the compression of every ADR (ADR §6). A change request that violates one is an **architectural** change, not a feature, and must pass the §18 gate or be rejected.

1. **AI is the core execution engine, not a feature layer.** Everything else exists to feed, run, isolate, ground, and surface AI computation.
2. **No cross-tenant leakage is architecturally impossible, not merely prevented.** Isolation lives at the data layer and fails closed; app scoping is redundancy (→ MULTI_TENANT_SECURITY).
3. **Every long-running process is async by construction.** Any blocking call in a hot path is a defect, not a slowdown (→ BACKEND, AGENT).
4. **All external integrations pass through the MCP abstraction.** Agents never touch a vendor API directly (→ MCP).
5. **Every insight is explainable via retrieved RAG context.** One service, one model (→ RAG).
6. **State lives in the data tier; compute is stateless and horizontally scalable** (→ INFRASTRUCTURE).
7. **Orchestration decides *when* and *where*; the application decides *what*.** Neither leaks into the other (→ INFRASTRUCTURE n8n, BACKEND).
8. **Extend the three agents; do not add a fourth architecture.** New capability = a node or a tool (→ AGENT, MCP).

---

## 6. The §18 five-gate check, applied system-wide

Every feature, in every phase, passes five gates before implementation (CLAUDE §18). At the system level they resolve to:

1. **Brief match** — right service (VoC / CompSig / Journey), MVP scope only, no post-launch module (CLAUDE §1 out-of-scope list).
2. **Build-Guide match** — approved stack (CLAUDE §3), exact structure (§4), exact schema (§5), build order (§19).
3. **Multi-tenancy** — RLS + `client_id` scoping intact; `app.current_client_id` set; agent/pool connections carry tenant context (CLAUDE §5, §6; AUD-08).
4. **Scalability** — holds at 100 and 500 clients; async; stateless; agents off the request path (NFR-04; Prime Directive).
5. **Observability** — LangSmith traces agent work; CloudWatch logs; audit trail intact (CLAUDE §14, §16).

**If any gate is NO → STOP, surface the conflict, propose a compliant alternative.**

---

## 7. Top system risks and where they are retired

From `MASTER_ROADMAP.md` §3. The three risks most capable of failing the Prime Directive, plus where this blueprint addresses each:

| Risk | What it threatens | Retired by / addressed in |
|---|---|---|
| **RISK-01** Cross-tenant leakage via unset session context on a pooled/background connection (AUD-08) | Forcing function #3 | Mandatory tenant-context-on-checkout helper + isolation test → MULTI_TENANT_SECURITY, BACKEND (P2/P3) |
| **RISK-02** DB connection exhaustion from connection-per-node (AUD-05) | Forcing function #2 | All agent/tool DB access via the shared pool → BACKEND, AGENT (P3/P4) |
| **RISK-03** LLM cost/latency blow-up at 500 clients | Forcing functions #1, #2 | Batching (20/batch), per-run item caps, budget alarms → AGENT (P4) |
| RISK-04 Lost runs on deploy/crash (BackgroundTasks durability) | Reliability | Idempotent, broker-portable agents; n8n re-trigger → BACKEND, AGENT |
| RISK-05 Prompt injection via ingested content | Security | Instruction isolation, output schema validation → AGENT, MULTI_TENANT_SECURITY |
| RISK-06 Scraper ToS/legal exposure | Legal/Ops | Prefer licensed APIs; legal gate before P5 → MCP |

---

## 8. Committed defaults for open decisions (flagged)

Per the approved plan, this blueprint commits to `MASTER_ROADMAP.md`'s recommended defaults so future phases execute without ambiguity. **Each remains pending maintainer ratification** and is owned by the document noted.

> **DEFAULT (pending ratification — D1 / AUD-01 / RISK-07):** Authentication = **custom-JWT backend** (per Build Guide), optionally fronted by Clerk later; the `client_id` token claim is fixed regardless of the ruling. → MULTI_TENANT_SECURITY, BACKEND. (ADR-011; CLAUDE §3.)

> **DEFAULT (pending ratification — D2 / AUD-03):** Runtime data path = **raw `asyncpg`**; SQLAlchemy `models/` exist for migrations/typing only, never as a parallel query path. → DATABASE_FOUNDATION, BACKEND.

> **DEFAULT (pending ratification — D3 / AUD-04 / RISK-08):** **Alembic** is the sole schema authority; no production auto-DDL; `create_tables()` only for ephemeral local/test. Alembic is a §3 stack addition requiring approval. → DATABASE_FOUNDATION.

> **DEFAULT (design standard — D4 / AUD-05 / AUD-08 / RISK-01/02):** Mandatory **tenant-context-on-checkout** pool helper + an isolation test proving a pooled/background connection cannot read another tenant's rows. → MULTI_TENANT_SECURITY, BACKEND.

> **DEFAULT (policy — D5 / AUD-13 / RISK-06):** Prefer **licensed/official APIs** (SerpAPI, News API) over `scrape_*`; legal review before P5; scrapers isolated and degrade gracefully. → MCP.

> **DEFAULT (scope — D6 / AUD-09 / RISK-14):** MVP NLP/ML depth = **`gpt-4o` LLM-based extraction**; deep ML (BERT/RoBERTa/HMM/LSTM) and v1.1 enhancements explicitly deferred. → AGENT.

> **DEFAULT (pending ratification — AUD-10):** PDF engine = **WeasyPrint** (HTML→PDF server-side → S3); a §3 stack addition requiring approval; Playwright-print noted as alternative. → INFRASTRUCTURE.

> **DEFAULT (AUD-12 / RISK-12):** Secrets in **AWS Secrets Manager**; per-client `data_sources.credentials` encrypted app-layer **AES-256 with a KMS-backed key**; 60-min JWT TTL; rotation plan. → MULTI_TENANT_SECURITY, INFRASTRUCTURE.

---

## 9. What this document is NOT

It does not define the folder layout (→ PROJECT_STRUCTURE), the schema DDL (→ DATABASE_FOUNDATION), route signatures (→ BACKEND), graph node code (→ AGENT), or deployment manifests (→ INFRASTRUCTURE). It fixes the **tiers, flows, invariants, and committed defaults** that all of those must honor. When a sibling document and this one appear to disagree, the more specific sibling governs its own region — but neither may contradict `CLAUDE.md`, which outranks all architecture documents (CLAUDE §0, §20).

---

*DataAutomated.io — SYSTEM_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Derived from CLAUDE.md, ARCHITECTURE_DECISION_RECORDS.md, and MASTER_ROADMAP.md.*
