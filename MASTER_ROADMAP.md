# MASTER_ROADMAP.md — DataAutomated.io

> **Artifact type:** PHASE 0 planning package (strategy only — no code, no implementation artifacts).
> **Inputs (authoritative):** `CLAUDE.md` (constitution / rules) and `ARCHITECTURE_DECISION_RECORDS.md`
> (rationale / ADR-001…012), which together encode the Product Brief v1.0 and the Technical Build
> Guide for Junex.
> **Contains all five PHASE-0 deliverables:** §1 Requirements Traceability Matrix · §2 Architecture
> Audit · §3 Risk Assessment · §4 Dependency Graph · §5 Roadmap & Execution Strategy.
> **Status (updated 2026-06-18):** Roadmap approved; execution heavily progressed.
> **Phases 0–3 ✓ COMPLETE.** Foundations (Repo, DB, FastAPI, Auth) are solid.
> **P4 (Agents):** ◧ CODE-COMPLETE, pending live LangSmith/OpenAI verification.
> **P5 (MCP Tools):** ✓ COMPLETE, with some scraper tools degraded pending legal review.
> **P6 (n8n/Reports):** ◧ MOSTLY IMPLEMENTED, pending live n8n/Resend/Slack/report verification.
> **P7 (RAG):** ◧ CODE-COMPLETE, pending real OpenAI quota/RAG verification.
> **P8 (Portal):** ◧ FRONTEND IMPLEMENTED, pending full E2E verification.
> **Phase 9 (AWS Production Deployment) ▢ NOT STARTED.** This is the only remaining engineering phase.
> Per-phase markers in §5 reflect actual repository state.
> **Version:** 1.0 | June 2026 | Confidential — Engineering Use Only

---

## How to read this document

This is the execution plan that sits on top of the constitution (`CLAUDE.md`) and the reasoning
(`ARCHITECTURE_DECISION_RECORDS.md`). It does four things in order: (1) proves every requirement has
a home (traceability), (2) stress-tests the design as specified (audit), (3) enumerates what can go
wrong and how we contain it (risk), (4) establishes the legal build order (dependencies), and then
(5) sequences the work into gated phases with explicit done-criteria.

Identifier conventions used throughout:
- **Requirements:** `FR-*` functional, `NFR-*` non-functional, `DR-*` data, `IR-*` integration,
  `SR-*` security, `OR-*` operational.
- **Phases:** `P0`…`P10` (see §5). `P0` is this planning package.
- **ADRs:** `ADR-001`…`ADR-012` from `ARCHITECTURE_DECISION_RECORDS.md`.
- **Audit findings:** `AUD-*`. **Risks:** `RISK-*`.

---

# §1. REQUIREMENTS TRACEABILITY MATRIX

Every requirement below is derived from the two source documents (as captured in `CLAUDE.md`). Each
row maps a requirement to its source, the ADR(s) that govern *how* it is satisfied, the phase that
delivers it, and the objective verification that proves it done. **Coverage rule:** no requirement
may exit PHASE 0 without a governing phase and a verification criterion.

### 1.1 Functional — Voice-of-Customer (VoC) Service
| ID | Requirement | Source | Gov. ADR | Phase | Verification (Done-When) |
|---|---|---|---|---|---|
| FR-VOC-01 | Ingest unprocessed feedback per client (latest 500, `processed=FALSE`) | Brief S1 / Guide P4 | ADR-003, ADR-004 | P4a | Agent fetch node returns only the tenant's unprocessed rows |
| FR-VOC-02 | NLP extraction: sentiment(-1..1), urgency(0..1), intent, primary_theme, churn_signal | Brief S1 / Guide P4 | ADR-002 | P4a | Unit test asserts sentiment sign per item; output schema validated |
| FR-VOC-03 | Theme taxonomy clustering with counts + averages | Brief S1 / Guide P4 | ADR-002 | P4a | Clustering node produces theme map; persisted to `feedback_insights.themes` |
| FR-VOC-04 | Churn risk score + early-warning alert (threshold > 0.15) | Brief S1 v1.1 / Guide P4 | ADR-002, ADR-006 | P4a, P6 | `alert_required` set on threshold; n8n webhook fires |
| FR-VOC-05 | Plain-language executive narrative (CEO-grade) | Brief S1 / Guide P4 | ADR-002, ADR-010 | P4a, P7 | Narrative persisted; references retrieved context once RAG lands |
| FR-VOC-06 | Temporal trend tracking across cohorts/tiers/channels | Brief S1 | ADR-003 | P4a / post-MVP depth | Insights carry period_start/period_end; trends queryable |
| FR-VOC-07 | Behavioral-feedback linkage (text ↔ behavior) | Brief S1 | ADR-003 | P4a/P4c interplay | Correlation surfaced (depth deferred; flagged AUD-09) |

### 1.2 Functional — Competitive Signal Engine (CSE)
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| FR-CSE-01 | Fetch client competitor set from config | Brief S2 / Guide P4 | ADR-002 | P4b | `fetch_competitors` node returns tenant competitor list |
| FR-CSE-02 | Multimodal signal mining via tools (G2, news, jobs, patents, …) | Brief S2 / Guide P4-5 | ADR-009 | P4b, P5 | Each tool returns normalized signals; agent consumes them |
| FR-CSE-03 | ML/LLM classify signal_type + score velocity/relevance | Brief S2 / Guide P4 | ADR-002 | P4b | Signals persisted with `signal_type`, `urgency` |
| FR-CSE-04 | Strategy alignment layer (strategic_context per signal) | Brief S2 | ADR-002, ADR-010 | P4b, P7 | `competitive_signals.strategic_context` populated |
| FR-CSE-05 | Critical-signal real-time alerts (urgency=critical) | Brief S2 / Guide P6 | ADR-006 | P6 | n8n routes critical signals to Slack + email |
| FR-CSE-06 | Win/Loss intelligence integration | Brief S2 v1.1 | ADR-002, ADR-009 | Post-MVP | Deferred; tracked, not built in MVP |

### 1.3 Functional — Behavioral Journey Intelligence (BJI)
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| FR-BJI-01 | Ingest journey/behavioral events per client | Brief S3 / Guide P4-5 | ADR-003, ADR-009 | P4c, P5 | `journey_events` populated via Mixpanel/Segment/Shopify tools |
| FR-BJI-02 | Funnel reconstruction + per-step drop-off | Brief S3 / Guide P4 | ADR-002 | P4c | `journey_insights.drop_off_rate` per step |
| FR-BJI-03 | Friction diagnosis (ux/messaging/expectation) | Brief S3 / Guide P4 | ADR-002 | P4c | `friction_cause` ∈ allowed set |
| FR-BJI-04 | Prioritized recommendations + projected lift | Brief S3 / Guide P4 | ADR-002 | P4c | `recommendation`, `projected_lift` persisted |
| FR-BJI-05 | Cohort comparison; micro-event intelligence | Brief S3 | ADR-002, ADR-003 | P4c / depth deferred | Cohort/micro-event fields present (depth flagged AUD-09) |
| FR-BJI-06 | Journey simulation + personalization path | Brief S3 v1.1 | ADR-002 | Post-MVP | Deferred; tracked |

### 1.4 Functional — Portal, Reports, Onboarding
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| FR-DASH-01 | Client dashboard: 3 services at a glance + KPI row | Brief MVP / Guide P8 | ADR-007 | P8 | `/dashboard` renders KPIs + snapshot cards from live API |
| FR-DASH-02 | Per-service pages + deep-dive detail routes | Guide P8 | ADR-007 | P8 | `/insights`,`/signals`,`/journeys` (+`/[id]`) load tenant data |
| FR-DASH-03 | Real-time dashboard updates on agent completion | Brief MVP / Guide P8 | ADR-012 | P8 | New insight appears via SSE without refresh |
| FR-RPT-01 | Weekly/periodic report generation to S3 | Brief MVP / Guide P6,P9 | ADR-006, ADR-008 | P6, P9 | Report row + S3 key; download link in email |
| FR-RPT-02 | Email/Slack delivery (Resend) of briefings + alerts | Brief / Guide P6 | ADR-006 | P6 | n8n delivers weekly brief + threshold alerts |
| FR-RPT-03 | PDF generation for reports | Brief build-order #7 | ADR-006, ADR-008 | P6/P9 | PDF produced & stored (engine choice flagged AUD-10) |
| FR-ONB-01 | New-client onboarding flow (connect sources, configure) | Brief build-order #8 | ADR-009 | P8/post-core | Client can connect a data source via `/settings` |

### 1.5 Data Requirements
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| DR-01 | Canonical multi-tenant schema (10 tables, exact names/cols) | Guide P2 / CLAUDE §5 | ADR-003 | P2 | Every table queryable; matches spec exactly |
| DR-02 | UUID PKs, TIMESTAMPTZ, JSONB conventions enforced | Guide P2 / CLAUDE §5 | ADR-003 | P2 | Schema review confirms conventions |
| DR-03 | pgvector enabled; `vector(1536)`; ivfflat cosine index | Guide P2,P7 | ADR-003, ADR-010 | P2, P7 | Vector index present; similarity query returns results |
| DR-04 | Per-client encrypted credentials in `data_sources` | Guide P2,P5 | ADR-009 | P2, P5 | Stored credentials are AES-256 ciphertext at rest |
| DR-05 | `clients.plan` reflects pricing tiers | Brief pricing | ADR-003 | P2 | Plan values constrained to known tiers |

### 1.6 Non-Functional Requirements
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| NFR-01 | Multi-tenant isolation at DB layer (RLS) + app scoping | Brief tech / CLAUDE §2,§6 | ADR-004, ADR-003 | P2 (all) | RLS policy on tenant tables; cross-tenant query returns ∅ |
| NFR-02 | Async-first backend; agents never block HTTP | Guide P3,P4 | ADR-001, ADR-005 | P3, P4 | Trigger endpoint returns < 100ms |
| NFR-03 | Full agent observability (LangSmith on every run) | Brief / Guide P4 | ADR-002 | P4 | LangSmith shows traces for all three agents |
| NFR-04 | Scale to 100→500 clients without redesign | Guide intro / CLAUDE §1 | ADR-008, ADR-001, ADR-004 | All | Load model holds; stateless tiers autoscale |
| NFR-05 | Performance targets (see §1.8) | Guide P10 | ADR-001, ADR-012 | P3,P4,P8,P10 | Benchmarks met under test |
| NFR-06 | No polling-heavy real-time; SSE push | CLAUDE §12 | ADR-012 | P8 | Dashboard updates via SSE, not client polling |

### 1.7 Security & Operational Requirements
| ID | Requirement | Source | Gov. ADR | Phase | Verification |
|---|---|---|---|---|---|
| SR-01 | JWT auth carrying `sub`+`client_id`; bcrypt passwords | Guide P3 | ADR-011 | P3 | `/auth/token` issues token; protected routes reject missing/invalid |
| SR-02 | `app.current_client_id` set every authenticated request | Guide P2-3 / CLAUDE §5 | ADR-004 | P3 | Middleware sets session var before tenant queries |
| SR-03 | Secrets in AWS Secrets Manager; never hardcoded; `.env` git-ignored | Brief / Guide P1,P9 | ADR-008, ADR-011 | P1, P9 | No secrets in repo; prod reads Secrets Manager |
| SR-04 | AES-256 encryption of stored credentials | Brief tech | ADR-009 | P2/P5 | Credentials encrypted before persistence |
| SR-05 | Complete audit trail of data access + agent actions | Brief tech / CLAUDE §14 | ADR-002, ADR-004 | P3-P4 (design), all | Audit records exist for access + agent runs |
| SR-06 | Zero-trust; store derived insights, not raw source data long-term | Brief tech | ADR-003 | P2-P4 | Retention policy: insights persisted, raw drained/aged |
| OR-01 | One container per service; reproducible local + prod | Guide P1,P9 | ADR-008 | P1, P9 | `docker-compose up` starts all services |
| OR-02 | ECS Fargate, ALB/CloudFront, RDS, S3, ECR, CloudWatch | Guide P9 | ADR-008 | P9 | `app.dataautomated.io` live; logs in CloudWatch |
| OR-03 | n8n cron/trigger layer (4 workflows) | Guide P6 | ADR-006 | P6 | Scheduled workflows fire and complete |
| OR-04 | MCP tool registry; per-client dynamic resolution | Guide P5 / CLAUDE §8 | ADR-009 | P5 | `get_tools_for_client` returns only connected sources |
| OR-05 | RAG via single central embedding service | Guide P7 / CLAUDE §9 | ADR-010 | P7 | One embedding path; no duplicate RAG |
| OR-06 | Conventional commits; PR-only to main; no `.env` commits | Guide P1 / CLAUDE §17 | — (process) | All | Branch protection + commit lint |
| OR-07 | Every new feature has a test; QA exit bar | Guide P10 / CLAUDE §16 | — (process) | P10 (all) | 0 failed LangSmith runs in 48h; benchmarks met |

### 1.8 Performance Targets (NFR-05 detail)
| Target | Threshold | Phase verified |
|---|---|---|
| `GET /dashboard/summary` | < 300 ms | P8, P10 |
| `POST /agents/voc/run` (trigger) | < 100 ms (async) | P3, P4 |
| VoC full run (500 items) | < 60 s | P4, P10 |
| CompSig full run | < 45 s | P4, P10 |
| Next.js dashboard page load | < 1.5 s | P8, P10 |

### 1.9 Coverage Summary
- **Functional:** all three services + dashboard + reports + onboarding mapped.
- **Deferred-but-tracked (post-MVP, not dropped):** FR-CSE-06 (Win/Loss), FR-BJI-06 (Simulation/Personalization), and the five roadmap modules in `CLAUDE.md §1` (Revenue Intelligence v1.2, AI Analyst Chat v1.2, Demand Forecasting v1.3, A/B Designer v1.3, Multi-Market v2.0). **Rule:** these MUST NOT be started during MVP (CLAUDE §1).
- **Every MVP requirement has a governing ADR, a phase, and a verification.** No orphans.

---

# §2. ARCHITECTURE AUDIT

This audits the design **as specified** in the source documents and governance files — its
strengths, internal inconsistencies, and gaps that must be resolved *before or during* the phase
that touches them. Findings are `AUD-*`; each names a disposition (resolve-now / resolve-in-phase /
accept-with-mitigation) and an owning phase.

### 2.1 Strengths (validated, no action)
- **Isolation model is sound and defense-in-depth** (ADR-004 + ADR-003): DB-layer RLS that fails
  closed, plus explicit `client_id` predicates. This is the right call for the stakes.
- **Latency model is coherent end-to-end** (ADR-001/005/012): async API → background agents →
  SSE push. The whole stack is organized around the 5–30s reality.
- **Single store keeps tenancy and vectors consistent** (ADR-003/010): embeddings inherit isolation;
  no cross-store sync bug surface.
- **Integration churn is contained** (ADR-009): the MCP boundary is the correct seam for 200+
  connectors.
- **Build order is dependency-correct** (DB → backend → agents → RAG → frontend): foundations first.

### 2.2 Inconsistencies between source documents / spec (must reconcile)
| ID | Finding | Where | Disposition | Owning phase |
|---|---|---|---|---|
| AUD-01 | **Auth mechanism conflict:** Brief says Clerk; Guide implements custom JWT. Already flagged in CLAUDE §3 / ADR-011 as an open question. | Brief tech vs Guide P3 | **Resolve-now** (decision needed before P3 hardening). Default: JWT backend, optional Clerk front. | P0 decision → P3 |
| AUD-02 | **`DATABASE_URL` dialect mismatch:** value uses `postgresql+asyncpg://` (SQLAlchemy dialect) but agents call `asyncpg.connect(DATABASE_URL)` directly — asyncpg does not accept the `+asyncpg` prefix. | Guide P1 env vs P4 agents | **Resolve-in-phase:** maintain a raw DSN for asyncpg and a SQLAlchemy URL separately (a `PGVECTOR_DATABASE_URL`/raw DSN already exists in env). | P2/P3 |
| AUD-03 | **ORM vs raw-SQL duality:** structure includes SQLAlchemy `models/` yet agents/services use raw `asyncpg`. Two data-access paradigms invite drift (e.g., schema defined in one, queried in the other). | Guide P1 models vs P4/P7 | **Resolve-now (decide pattern):** designate raw-asyncpg as the runtime data path; if ORM models are kept, they are for migrations/typing only, not a parallel query path. | P2 |
| AUD-04 | **`create_tables()` on startup vs migrations:** Guide calls `create_tables()` at app startup; CLAUDE §5 mandates reviewed migrations and "never rename." Startup auto-DDL conflicts with controlled migration governance. | Guide P3 vs CLAUDE §5 | **Resolve-now:** adopt a migration tool as the single schema authority; `create_tables` (if kept) only for ephemeral local/test, never prod. | P2 |

### 2.3 Scalability gaps vs the 500-client mandate (NFR-04)
| ID | Finding | Risk if unaddressed | Disposition | Owning phase |
|---|---|---|---|---|
| AUD-05 | **Connection-per-node:** agents open `asyncpg.connect(...)` inside each node and close it. At 500 clients × multi-node graphs × scheduled sweeps this exhausts DB connections and adds latency. The approved `database.py` connection **pool** exists but the agent code bypasses it. | DB connection exhaustion; breaches NFR-04. | **Resolve-in-phase:** all agent/tool DB access goes through the shared pool; no ad-hoc connects. Critically, pooled connections must still set `app.current_client_id` (ties to AUD-08). | P3 (pool) → P4 |
| AUD-06 | **BackgroundTasks durability (ADR-005 tradeoff):** in-process tasks lose runs on container restart; no retry/dead-letter. | Silent loss of agent runs under deploys/crashes. | **Accept-with-mitigation** for MVP: n8n scheduled sweeps re-trigger; keep agent entry points idempotent & broker-portable. Revisit post-MVP. | P4/P6 design |
| AUD-07 | **SSE detection via 5s DB poll (ADR-012 note):** per-connection 5s polling loop scales poorly with concurrent dashboards. | DB load grows with open dashboards. | **Accept-with-mitigation** for MVP; plan event-on-persist notification post-MVP. Cap/backoff connections. | P8 |
| AUD-08 | **RLS on background/agent connections (ADR-004 sharp edge):** RLS only protects connections where the session var is set. Pooled/background connections that skip request middleware can operate **outside** isolation. | Cross-tenant leakage — the highest-stakes failure. | **Resolve-now (design standard):** mandatory helper that sets `app.current_client_id` (or `SET LOCAL` in a txn) on *every* checkout used for tenant data, agent paths included. Add a test that proves isolation on a pooled connection. | P2/P3 → enforced P4 |

### 2.4 Security gaps to close in-phase
| ID | Finding | Disposition | Owning phase |
|---|---|---|---|
| AUD-11 | **Prompt injection via ingested content:** feedback/scraped text flows into LLM prompts; malicious content could manipulate narratives/classifications. Not addressed in source docs. | **Resolve-in-phase:** input demarcation, instruction-isolation in prompts, output schema validation, treat tool/LLM output as untrusted. | P4 |
| AUD-12 | **Secrets lifecycle:** JWT signing secret + per-client API creds are high-value; rotation/revocation not specified (ADR-011 tradeoff). | **Resolve-in-phase:** short token TTL (env already 60min), rotation plan, denylist option; KMS-backed encryption key for creds. | P3/P9 |
| AUD-13 | **Scraping legality/ToS (G2, Capterra, LinkedIn):** scraper tools may violate ToS / legal constraints; also fragile. | **Resolve-now (policy) + in-phase (impl):** prefer official/licensed APIs (e.g., SerpAPI/News API) where possible; legal review of scraping sources before P5. | P0 policy → P5 |

### 2.5 Functional-depth gaps (acknowledged scope calibration)
| ID | Finding | Disposition |
|---|---|---|
| AUD-09 | **ML depth vs LLM substitution:** Brief promises HMM/LSTM/Bayesian (journey) and BERT/RoBERTa (VoC); Guide implements via `gpt-4o`. MVP uses LLM extraction as the sanctioned simplification (CLAUDE §3). Temporal trends, micro-events, cohort depth, behavioral-feedback linkage are **shallow in MVP**. | **Accept (scope):** MVP delivers the LLM-based pipeline; deeper ML is post-MVP. Make this explicit to stakeholders so "v1.1 enhancement" expectations are not assumed in MVP. |
| AUD-10 | **PDF generation engine unspecified:** reports require PDF (FR-RPT-03) but no library/approach is named. | **Resolve-in-phase:** select PDF approach in P6/P9 (server-side render → S3). Flag as a deferred tech choice (not in approved stack list → needs CLAUDE §3 approval). |

### 2.6 Audit verdict
The architecture is **sound and internally coherent at the design level**; isolation, latency, and
observability — the three highest-stakes concerns — are well-handled. The material work for PHASE 0
is to **resolve four "resolve-now" items before their phases begin** (AUD-01 auth, AUD-03 data-path,
AUD-04 migrations, AUD-08 pooled-connection isolation; plus AUD-13 scraping policy), and to carry
the accept-with-mitigation items (AUD-06, AUD-07, AUD-09) as known, documented constraints. None are
blockers to starting P1/P2; AUD-08 is the one that must be nailed before any tenant data is read on a
pooled/background connection.

---

# §3. RISK ASSESSMENT

Risk register. **Severity = Likelihood × Impact** (L/M/H). Each risk has an owner phase and a
mitigation. Risks are ordered by severity.

| ID | Risk | Category | Likelihood | Impact | Severity | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| RISK-01 | Cross-tenant data leakage via unset session context on pooled/background connection (AUD-08) | Security/Tenancy | Med | Critical | **High** | Mandatory tenant-context helper on every checkout; isolation test on pooled conns; RLS fails closed | P2/P3→P4 |
| RISK-02 | DB connection exhaustion at scale from connection-per-node (AUD-05) | Scale | High | High | **High** | Route all agent/tool DB access through shared pool; load-test at 500-client model | P3/P4 |
| RISK-03 | LLM cost & latency blow-up at 500 clients (continuous sweeps × gpt-4o) | Cost/Scale | High | High | **High** | Batch (already 20/batch); cap items/run; cheaper models for extraction; budget alarms; per-tenant rate limits | P4/P6 |
| RISK-04 | Lost agent runs on deploy/crash (BackgroundTasks durability, AUD-06) | Reliability | Med | High | **High** | Idempotent agents; n8n re-trigger sweeps; plan broker migration post-MVP | P4/P6 |
| RISK-05 | Prompt injection via ingested feedback/scraped content (AUD-11) | Security | Med | High | **High** | Instruction isolation, untrusted-input handling, output schema validation, no tool-exec from content | P4 |
| RISK-06 | Scraper ToS/legal exposure & breakage (G2/Capterra/LinkedIn) (AUD-13) | Legal/Operational | High | Med | **High** | Legal review pre-P5; prefer licensed APIs; isolate scrapers; graceful degradation | P0/P5 |
| RISK-07 | Auth ambiguity (Clerk vs JWT) causes rework if decided late (AUD-01) | Schedule/Security | Med | Med | **Med** | Decide in P0 before P3 hardening; keep tenant-claim contract fixed either way | P0/P3 |
| RISK-08 | Schema drift from startup auto-DDL vs migrations (AUD-04) | Data integrity | Med | High | **Med** | Migration tool as single authority; disable prod auto-DDL | P2 |
| RISK-09 | pgvector recall/scale ceiling as embeddings grow (ADR-003 tradeoff) | Scale | Med | Med | **Med** | Tune ivfflat lists; monitor recall/latency; pre-design extraction path if needed | P7/post-MVP |
| RISK-10 | Third-party API rate limits / outages stall ingestion | Operational | High | Med | **Med** | Per-source backoff/retry in tools; decouple ingestion from analysis; alerting | P5/P6 |
| RISK-11 | Single n8n instance is a SPOF (ADR-008 stateful exception) | Operational | Med | Med | **Med** | Persistent storage + backups; restart policy; idempotent workflows; monitor | P6/P9 |
| RISK-12 | Secret/key compromise (JWT signing key, client creds) (AUD-12) | Security | Low | Critical | **Med** | Secrets Manager + KMS; short TTL; rotation; least-privilege IAM | P3/P9 |
| RISK-13 | SSE connection load from 5s server-side poll (AUD-07) | Scale | Med | Low | **Low** | Connection caps/backoff; move to event-on-persist post-MVP | P8 |
| RISK-14 | Scope/expectation gap: MVP LLM depth vs Brief's ML promises (AUD-09) | Stakeholder | Med | Med | **Med** | Explicit MVP-vs-v1.1 communication; traceability deferral list (§1.9) | P0 |
| RISK-15 | GDPR/SOC2 obligations (data residency, retention, audit) under-specified for build | Compliance | Med | High | **Med** | Encode retention (SR-06) + audit (SR-05) early; compliance review before GA | P2-P4/pre-GA |
| RISK-16 | Timeline compression: 35-day plan with heavy parallelism, single builder | Schedule | High | Med | **Med** | Phase gates; critical-path focus (§4); cut depth (AUD-09) not foundations | All |

**Top-3 risk posture:** isolation correctness (RISK-01), DB scalability of the agent data path
(RISK-02), and LLM economics (RISK-03) are the risks most capable of failing the Prime Directive
("hold at 500 clients"). All three are addressable in P2–P4 and are explicitly gated in §5.

---

# §4. DEPENDENCY GRAPH

Two views: **phase-level** (what must finish before what) and **component-level** (what a component
needs to exist). "Hard" = blocking; "soft" = can start in parallel but completes after.

### 4.1 Phase dependency DAG (hard edges)
```
                         ┌─────────────────────────┐
                         │ P0  Planning (this doc)  │
                         └────────────┬─────────────┘
                                      ▼
                         ┌─────────────────────────┐
                         │ P1  Project Setup / Repo │
                         └────────────┬─────────────┘
                                      ▼
                         ┌─────────────────────────┐
                         │ P2  Database + RLS       │  ◄── foundation; blocks all data work
                         └────────────┬─────────────┘
                                      ▼
                         ┌─────────────────────────┐
                         │ P3  FastAPI + Auth +     │
                         │     Conn-Pool + Tenant   │
                         │     Context (AUD-08)     │
                         └───┬───────────────┬──────┘
                  hard       │               │ hard
              ┌──────────────▼───┐      ┌────▼───────────────┐
              │ P5  MCP Tools    │◄────►│ P4  LangGraph      │  (P5 soft-parallel w/ P4;
              │ (parallel)       │ soft │ Agents:            │   agents need tools to mine,
              └──────────────────┘      │  P4a VoC           │   but VoC can run on DB-only
                                        │  P4b CompSig       │   feedback first)
                                        │  P4c Journey       │
                                        └────┬───────────────┘
                                             ▼
                                   ┌─────────────────────────┐
                                   │ P7  RAG (central         │  (enriches narratives; agents
                                   │     embedding service)   │   functional before it lands)
                                   └────────────┬─────────────┘
                                                ▼
              ┌─────────────────────────┐   ┌─────────────────────────┐
              │ P6  n8n Workflows +      │   │ P8  Next.js Portal + SSE │
              │     Reports/Alerts       │   │     (needs P3 API +      │
              │ (needs P3 endpoints +    │   │      P4 persisted data)  │
              │  P4 agent run endpoints) │   └────────────┬─────────────┘
              └────────────┬─────────────┘                │
                           └───────────────┬──────────────┘
                                           ▼
                                ┌─────────────────────────┐
                                │ P9  Docker + AWS Deploy  │  (needs all services containerized)
                                └────────────┬─────────────┘
                                             ▼
                                ┌─────────────────────────┐
                                │ P10 QA + Polish (exit)   │  (spans P1→P9; hard gate at end)
                                └─────────────────────────┘
```

### 4.2 Critical path
`P0 → P1 → P2 → P3 → P4(a→b→c) → P8 → P9 → P10`.
- **P2 (DB+RLS)** and **P3 (API+auth+pool+tenant-context)** are the highest-leverage foundations —
  everything downstream depends on them, and the two highest risks (RISK-01, RISK-02) are retired
  here.
- **P5 (MCP)** runs parallel to P4 but is a hard input to CSE/Journey mining (FR-CSE-02, FR-BJI-01);
  VoC (P4a) can proceed on DB-resident feedback before tools exist, which is why VoC is sequenced
  first (matches Brief build order).
- **P7 (RAG)** is a soft enhancer: agents must be functional without it (FR-VOC-05 narrative works;
  RAG enriches it). RAG is therefore *not* on the critical path to "agents run."
- **P6 (n8n)** depends on stable P3/P4 endpoints (the published-interface contract, ADR-006).

### 4.3 Component dependency table
| Component | Hard deps | Soft deps | Blocks |
|---|---|---|---|
| Schema + RLS (P2) | uuid-ossp, pgvector ext | — | every data path, all agents, RAG, reports |
| Conn pool + tenant-context helper (P3) | schema (P2) | — | all agent/tool DB access (RISK-01/02) |
| JWT auth + middleware (P3) | schema (users), AUD-01 decision | — | all protected routes, SSE, portal |
| MCP tools (P5) | `data_sources` creds (P2), encryption (SR-04) | external APIs | CSE/Journey mining |
| Agents (P4) | P2, P3 pool+context | P5 tools, P7 RAG | insights data, dashboard data, alerts |
| Embedding service / RAG (P7) | pgvector (P2), embeddings model | agents (P4) | enriched narratives |
| n8n workflows (P6) | P3 endpoints, P4 run endpoints, Resend | reports/PDF | scheduled ingestion, alerts, weekly reports |
| Portal + SSE (P8) | P3 API, P4 persisted data | P7 narratives | client-visible value |
| Deploy (P9) | all services containerized (P1,P3,P8,P6) | Secrets Manager | production |
| QA (P10) | all of the above | — | GA sign-off |

---

# §5. MASTER ROADMAP & EXECUTION STRATEGY

### 5.1 Operating model
- **Phases run one at a time.** Each phase has **entry criteria** (what must be true to start),
  **deliverables**, **exit/done-criteria** (objective, from §1 verifications), the **ADRs/requirements
  it satisfies**, the **risks it retires**, and a **verification method**.
- **A phase is not "done" until its exit criteria pass.** P10 (QA) is continuous but also a hard final
  gate.
- **Governance is binding:** every phase obeys `CLAUDE.md` (no stack deviation, no schema rename, no
  RLS bypass, conventional commits, PR-only). The Engineering Decision Framework (CLAUDE §18) gates
  every feature inside a phase.
- **Timeline anchor:** the Build Guide's 35-day map is the reference cadence; days are indicative,
  gates are authoritative.

### 5.2 PHASE 0 — Planning & Decisions (this document) — ✓ COMPLETE
- **Objective:** produce this package; resolve the "resolve-now" decisions so P1–P3 are unblocked.
- **Deliverables:** §1–§5 of this file.
- **Decisions required to exit P0 (owner: maintainer):**
  - **D1 (AUD-01/RISK-07):** Auth = custom JWT backend (default) vs Clerk-fronted. *Recommendation:
    JWT backend now; Clerk optional later. Keep `client_id` token claim fixed regardless.*
  - **D2 (AUD-03):** Runtime data path = raw asyncpg (recommended); ORM models for migrations/typing
    only.
  - **D3 (AUD-04/RISK-08):** Adopt a migration tool as sole schema authority; no prod auto-DDL.
  - **D4 (AUD-08/RISK-01):** Mandatory tenant-context-on-checkout standard + isolation test — adopt
    before any tenant read on a pooled connection.
  - **D5 (AUD-13/RISK-06):** Scraping policy — legal review + prefer licensed APIs before P5.
  - **D6 (AUD-09/RISK-14):** Confirm MVP = LLM-based depth; v1.1 ML depth explicitly deferred.
- **Exit criteria:** roadmap approved; D1–D6 ruled (or explicitly deferred with risk accepted).

### 5.3 PHASE 1 — Project Setup & Repository Structure  *(ref Day 1–2)* — ✓ COMPLETE
- **Entry:** P0 approved.
- **Deliverables:** approved folder structure (CLAUDE §4); local Docker dev env; `.env.example`;
  git discipline (branch protection, commit lint); CI skeleton.
- **Satisfies:** OR-01, OR-06, SR-03 (git-ignore `.env`).
- **Risks retired:** baseline for RISK-16 (gates in place).
- **Exit / Done-When:** `docker-compose up` starts all service stubs; repo matches CLAUDE §4 exactly;
  no secrets in VCS.

### 5.4 PHASE 2 — Database & Multi-Tenancy Foundation  *(ref Day 2–4)* — ✓ COMPLETE
- **Entry:** P1 done; D2, D3, D4 ruled.
- **Deliverables:** full canonical schema (DR-01/02), extensions (DR-03), RLS enabled + policies on
  tenant tables (NFR-01), encryption-at-app-layer design for credentials (SR-04/DR-04), migration
  tooling as schema authority (AUD-04), seed/test data.
- **Satisfies:** DR-01..05, NFR-01, SR-04, SR-06 (retention design), part of SR-02.
- **Risks retired:** RISK-08; foundation for RISK-01.
- **Exit / Done-When:** every table queryable and matches spec; a cross-tenant query under RLS
  returns ∅; migration up/down works; schema review signs off (no renames vs spec).

### 5.5 PHASE 3 — FastAPI Backend, Auth, Pool & Tenant Context  *(ref Day 4–8)* — ✓ COMPLETE
- **Entry:** P2 done; D1 (auth) ruled.
- **Deliverables:** async FastAPI app + routers (CLAUDE §10); JWT auth + bcrypt (SR-01); middleware
  sets `app.current_client_id` (SR-02); **shared asyncpg pool + mandatory tenant-context-on-checkout
  helper + isolation test (AUD-05/AUD-08)**; background-task dispatch pattern (NFR-02); CORS; error
  handling; audit-trail scaffolding (SR-05).
- **Satisfies:** SR-01, SR-02, SR-05, NFR-02, NFR-05 (trigger latency), OR (API contract for n8n).
- **Risks retired:** **RISK-01, RISK-02** (the two structural scale/isolation risks); part of
  RISK-12.
- **Exit / Done-When:** `/docs` shows all endpoints; JWT auth passes; trigger endpoint < 100ms;
  **isolation test proves a pooled/background connection cannot read another tenant's rows**;
  AUD-02 DSN handling resolved.

### 5.6 PHASE 4 — LangGraph Agents  *(ref Day 8–18)* — sub-phased — ◧ CODE-COMPLETE (not operationally verified)
- **Status (2026-06-08):** All three agents (P4a VoC, P4b CompSig, P4c Journey) are implemented as
  `@traceable` LangGraph `StateGraph`s, wired to their routers, with 148 passing tests (unit + E2E
  mocked-LLM + tenant-isolation + no-key fail-safe). **Not yet operationally verified:** no live
  LangSmith traces captured (keys now in `.env`), perf targets unmeasured against real data, and
  `comp_signal_agent.mine_signals` is a deliberate **P5 stub** (returns `[]`) — CompSig persists no
  real signals until P5 MCP tools land. P4 flips to ✓ COMPLETE once live traces + perf are verified.
- **Entry:** P3 done (pool + tenant context mandatory).
- **P4a VoC Agent:** graph (fetch→nlp→cluster→narrative→check_alert→store); LangSmith tracing
  (NFR-03); per-node unit tests; prompt-injection hardening (AUD-11/RISK-05).
  - *Satisfies:* FR-VOC-01..05; *retires:* RISK-05 (VoC path), part RISK-03.
  - *Done-When:* LangSmith shows successful VoC traces; insights persisted; `processed` drained;
    VoC full run < 60s.
- **P4b Competitive Signal Agent:** graph (fetch_competitors→mine→classify→context→flag→store);
  consumes MCP tools from P5.
  - *Satisfies:* FR-CSE-01..05; *Done-When:* CompSig traces succeed; signals persisted; < 45s.
- **P4c Behavioral Journey Agent:** graph (fetch_events→funnels→dropoffs→diagnose→recommend→store).
  - *Satisfies:* FR-BJI-01..04; *Done-When:* journey insights persisted; traces succeed.
- **Cross-cutting exit:** all three agents idempotent & broker-portable (mitigates RISK-04);
  batching/limits enforced (RISK-03); LangSmith = 3 healthy agents.

### 5.7 PHASE 5 — MCP Tool Layer  *(ref Day 12–16, parallel with P4)* — ✓ COMPLETE (2026-06-09)
- **Entry:** P2 (`data_sources`+encryption); D5 scraping policy ruled.
- **Deliverables:** ≥5 tools across the official catalog (CLAUDE §8), registry, per-client dynamic
  resolution (OR-04), encrypted-cred retrieval (SR-04), per-source backoff/retry (RISK-10),
  normalized outputs.
- **Satisfies:** OR-04, FR-CSE-02, FR-BJI-01, DR-04.
- **Risks retired:** part RISK-06 (policy applied), RISK-10 (resilience).
- **Exit / Done-When:** each tool returns normalized data from its API; `get_tools_for_client`
  returns only connected sources; scrapers within legal policy.
- **Verification (2026-06-09):** 6 tools delivered (zendesk, typeform, news — fully implemented;
  g2, capterra, linkedin_jobs — graceful-degrade stubs per AUD-13/RISK-06); `get_tools_for_client`
  DB-tested with tenant isolation (client B cannot see client A's sources); LangChain `arun(dict)`
  seam tested end-to-end; 30/30 MCP tests pass (24 unit + 6 DB). Full suite: 183/183 green.

### 5.8 PHASE 6 — n8n Workflows, Reports & Alerts  *(ref Day 14–18)*
- **Entry:** P3 endpoints + P4 agent-run endpoints stable.
- **Deliverables:** 4 workflows (ingestion, competitive monitor, weekly report, churn webhook);
  Resend delivery; report generation to S3 + PDF (FR-RPT-03, AUD-10 engine chosen); workflows
  exported as versioned JSON.
- **Satisfies:** OR-03, FR-VOC-04 (alert path), FR-CSE-05, FR-RPT-01/02/03.
- **Risks retired:** RISK-04 (re-trigger sweeps), part RISK-11.
- **Exit / Done-When:** scheduled workflow fires and completes without error; weekly brief email +
  threshold alerts delivered; PDF stored in S3 with working link.

### 5.9 PHASE 7 — RAG Knowledge Base  ◧ CODE-COMPLETE *(ref Day 16–20)*
- **Entry:** P2 (pgvector), P4 agents functional. ✓
- **Deliverables:** central embedding service (single path, OR-05) ✓; `rag_context_node` inserted
  before narrative_generation ✓; tenant+global retrieval ✓; 11 new tests (tenant isolation, result
  shape, diverse-random-vector performance <50ms @ 1000 embeddings) ✓; 194/194 tests green ✓.
- **Satisfies:** OR-05 ✓, enriches FR-VOC-05 ✓, FR-CSE-04 (narrative ready for CompSig context).
- **Risks retired:** baseline for RISK-09 (ivfflat index confirmed performant at 1000 diverse rows).
- **Remaining blockers — OpenAI billing required:** (1) `seed_embeddings.py` — 53 global entries
  not yet seeded (`insufficient_quota` on current key); (2) live `retrieve_similar` end-to-end
  unverified against real vectors; (3) LangSmith traces with rag_context_node not captured.
  P7 flips to ✓ COMPLETE once billing is funded and seed + live trace are verified.
- **Exit / Done-When:** seed 50+ global rows; VoC narrative references retrieved context (live
  LangSmith trace); no duplicate RAG path ✓; 194/194 tests green ✓.

### 5.10 PHASE 8 — Next.js Client Portal + SSE  *(ref Day 18–28)*
- **Entry:** P3 API + P4 persisted data.
- **Deliverables:** 5 core pages + detail routes (FR-DASH-01/02); typed API client; server-first
  rendering (ADR-007); SSE real-time (FR-DASH-03, NFR-06); settings/onboarding entry (FR-ONB-01).
- **Satisfies:** FR-DASH-*, FR-ONB-01, NFR-06, NFR-05 (page load).
- **Risks retired:** part RISK-13 (connection caps).
- **Exit / Done-When:** client logs in and sees live tenant data; new insight appears via SSE
  without refresh; dashboard load < 1.5s; no client-side polling.

### 5.11 PHASE 9 — Docker & AWS Deployment  *(ref Day 25–32)*
- **Entry:** all services containerized; Secrets Manager populated.
- **Deliverables:** ECS Fargate services (autoscale backend 2→10), ALB/CloudFront, RDS (pg16+
  pgvector), S3, ECR, CloudWatch, Secrets Manager (OR-02, SR-03); secret rotation plan (AUD-12);
  n8n single-task + persistent storage (RISK-11).
- **Satisfies:** OR-02, NFR-04 (autoscaling realized), SR-03, part SR-04/SR-05 (KMS, log audit).
- **Risks retired:** part RISK-12, RISK-11.
- **Exit / Done-When:** `app.dataautomated.io` live in production; logs in CloudWatch; autoscaling
  verified under load model.

### 5.12 PHASE 10 — QA, Performance & Hardening  *(ref Day 30–35, continuous)*
- **Entry:** spans all phases; final gate after P9.
- **Deliverables:** unit/agent/integration tests (CLAUDE §16); performance benchmark suite (§1.8);
  load test at 500-client model (validates RISK-01/02/03); compliance review (RISK-15); daily
  operational checklist live.
- **Satisfies:** OR-07, NFR-05, NFR-04 (proven).
- **Risks retired:** validates RISK-01/02/03 retirement; RISK-15.
- **Exit / Done-When (GA bar):** all tests pass; all §1.8 benchmarks met; 0 failed LangSmith runs in
  48h; no open critical/high bugs; isolation load-test clean.

### 5.13 Execution strategy summary
- **Sequence:** P0 → P1 → P2 → P3 → P4a → (P5 ∥) → P4b → P4c → P7 → P6 → P8 → P9 → P10.
- **Do-not-skip foundations (CLAUDE §19):** P2 and P3 are non-negotiable prerequisites; the two
  structural risks (isolation, DB scale) are retired *before* agents read tenant data.
- **What we deliberately defer:** v1.1 enhancements, post-MVP roadmap modules, deep ML, broker-based
  task durability, event-on-persist SSE — all tracked in §1.9 / §3, none silently dropped.
- **Change control:** any deviation from `CLAUDE.md` (stack, schema, RLS, structure) or any new tech
  choice (e.g., PDF engine, migration tool) requires a recorded decision (CLAUDE §18) — these are
  enumerated as D1–D6 and the AUD "resolve-in-phase" items.
- **Next action after approval:** begin **P1** only; each subsequent phase starts after the prior
  phase's exit criteria pass.

---

## Approval checklist (what "roadmap approved" means)
- [ ] Traceability accepted: every MVP requirement has phase + verification (§1).
- [ ] Audit dispositions accepted; D1–D6 decisions ruled or consciously deferred (§2, §5.2).
- [ ] Risk posture accepted, esp. top-3 (RISK-01/02/03) mitigations (§3).
- [ ] Build order / critical path accepted (§4).
- [ ] Phase gates accepted; agree to one-phase-at-a-time execution starting at P1 (§5).

*DataAutomated.io — MASTER_ROADMAP.md v1.0 | June 2026 | Confidential — Engineering Use Only.
PHASE 0 deliverable. Companion to CLAUDE.md (rules) and ARCHITECTURE_DECISION_RECORDS.md (rationale).*
