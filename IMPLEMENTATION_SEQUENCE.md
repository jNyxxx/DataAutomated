# IMPLEMENTATION_SEQUENCE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The executable build order — which phase builds what, in what order, gated by what entry/exit criteria, governed by which architecture documents. This is the index future phases follow; it fuses the build order, dependency graph, and phase gates into one execution map.
> **Governing sources:** `CLAUDE.md` §19 (build order), §18 (decision framework), §16 (testing/QA exit), §17 (git); `ARCHITECTURE_DECISION_RECORDS.md` (all ADRs, referenced per phase); `MASTER_ROADMAP.md` §1 (traceability + §1.8 perf), §2 (audit/AUD), §3 (risks), §4 (dependency DAG + critical path), §5 (phase gates P0–P10).
> **Sibling documents:** all ten — this document maps each to the phase(s) that consume it.
> **Scope boundary:** No code, no schedules executed. This is the planning spine; the ten sibling documents hold the *how* for each region.

---

## 1. Operating model (MASTER_ROADMAP §5.1; CLAUDE §19)

- **Phases run one at a time.** A phase is **not done** until its exit criteria pass.
- **Foundations first; never skip them.** P2 (DB+RLS) and P3 (API+auth+pool+tenant-context) are non-negotiable prerequisites — the two structural risks (isolation, DB scale) are retired **before** any agent reads tenant data (CLAUDE §19; RISK-01/02).
- **Governance is binding.** Every phase obeys `CLAUDE.md` (no stack deviation, no schema rename, no RLS bypass, conventional commits, PR-only). The §18 five-gate framework gates every feature inside a phase (SYSTEM §6).
- **Timeline anchor:** the Build Guide's 35-day map is the reference cadence; **days are indicative, gates are authoritative**.

---

## 2. Phase dependency DAG + critical path (reproduced from MASTER_ROADMAP §4)

```
P0 Planning ─► P1 Setup ─► P2 DB+RLS ─► P3 FastAPI+Auth+Pool+TenantCtx
                                              │
                                  ┌───────────┴───────────┐
                                  ▼                        ▼
                          P5 MCP Tools  ◄── soft ──►  P4 Agents (a VoC→b CompSig→c Journey)
                          (parallel w/ P4)                 │
                                                           ▼
                                                   P7 RAG (soft enhancer)
                                                           │
                                  ┌────────────────────────┴───────────┐
                                  ▼                                     ▼
                          P6 n8n + Reports/Alerts            P8 Next.js Portal + SSE
                                  └─────────────────┬───────────────────┘
                                                    ▼
                                            P9 Docker + AWS Deploy
                                                    ▼
                                            P10 QA + Polish (exit gate; spans P1→P9)
```

**Critical path:** `P0 → P1 → P2 → P3 → P4(a→b→c) → P8 → P9 → P10`.
- **P5 (MCP)** runs parallel to P4 but is a hard input to CompSig/Journey mining; **VoC (P4a) can proceed on DB-resident feedback before tools exist**, which is why VoC is sequenced first.
- **P7 (RAG)** is a **soft** enhancer — agents must be functional without it; not on the critical path to "agents run."
- **P6 (n8n)** depends on stable P3/P4 endpoints (the published-interface contract, ADR-006).
- **Execution sequence:** `P0 → P1 → P2 → P3 → P4a → (P5 ∥) → P4b → P4c → P7 → P6 → P8 → P9 → P10` (MASTER_ROADMAP §5.13).

---

## 3. Architecture-document → phase map

| Document | Primary phase(s) | Also consumed by |
|---|---|---|
| SYSTEM_ARCHITECTURE | all (orientation) | every phase |
| PROJECT_STRUCTURE | **P1** | all (placement) |
| DATABASE_FOUNDATION | **P2** | P3, P4, P5, P7 |
| MULTI_TENANT_SECURITY | **P2/P3** | P4, P5, P8, P9 |
| BACKEND_ARCHITECTURE | **P3** | P4, P6, P8 |
| AGENT_ARCHITECTURE | **P4a/b/c** | P6, P7 |
| MCP_ARCHITECTURE | **P5** | P4b, P4c |
| RAG_ARCHITECTURE | **P7** | P4 (node insertion) |
| FRONTEND_ARCHITECTURE | **P8** | P6 (report links) |
| INFRASTRUCTURE_ARCHITECTURE | **P1 (local), P9 (prod), P6 (n8n)** | all |
| IMPLEMENTATION_SEQUENCE | all | — |

---

## 4. The P0 exit decisions (must be ruled before their phases — MASTER_ROADMAP §5.2)

This blueprint **commits to the recommended default for each** (flagged in the owning document) so phases can proceed; each **still requires maintainer ratification** at or before the phase noted.

| Decision | Default committed (owning doc) | Needed before |
|---|---|---|
| **D1** (AUD-01/RISK-07) auth | custom-JWT backend; `client_id` claim fixed (MULTI_TENANT_SECURITY §5; BACKEND §4) | P3 hardening |
| **D2** (AUD-03) data path | raw asyncpg runtime; ORM for migrations/typing only (DATABASE_FOUNDATION §6) | P2 |
| **D3** (AUD-04/RISK-08) migrations | Alembic as sole authority; no prod auto-DDL (DATABASE_FOUNDATION §5) | P2 |
| **D4** (AUD-05/08/RISK-01/02) tenant context | tenant-context-on-checkout helper + isolation test (MULTI_TENANT_SECURITY §4; BACKEND §5) | before any tenant read on a pooled conn (P2/P3) |
| **D5** (AUD-13/RISK-06) scraping | prefer licensed APIs; legal gate; isolate scrapers (MCP §7) | P5 |
| **D6** (AUD-09/RISK-14) ML depth | LLM-based MVP; deep ML deferred (AGENT §2) | P4 (scope comms in P0) |
| **AUD-10** PDF engine | WeasyPrint (flag §3 approval) (INFRASTRUCTURE §4) | P6/P9 |
| **AUD-12/RISK-12** secrets | Secrets Manager + KMS + rotation; 60-min TTL (MULTI_TENANT_SECURITY §6; INFRASTRUCTURE §6) | P3 design, P9 harden |

---

## 5. Per-phase execution gates

> **Progress snapshot (2026-06-08).** P0–P3 **✓ DONE** · P4 **◧ CODE-COMPLETE** (148 tests green; *not yet operationally verified* — no live LangSmith traces captured, and CompSig persists no real signals until P5 MCP tools exist) · P5–P10 **▢ NOT STARTED**. The markers below reflect actual repository state, not plan intent. Exit criteria that require live operation (LangSmith traces, perf-under-load) are noted as pending where applicable.

### P1 — Project Setup & Repository Structure *(ref Day 1–2)* — ✓ DONE
- **Entry:** P0 approved.
- **Governing docs:** PROJECT_STRUCTURE, INFRASTRUCTURE (local).
- **Deliverables:** approved folder structure (CLAUDE §4); local Docker dev env; `.env.example`; git discipline (branch protection, commit lint); CI skeleton. *Satisfies* OR-01, OR-06, SR-03.
- **Exit / Done-When:** `docker-compose up` starts all service stubs; repo matches CLAUDE §4 exactly; no secrets in VCS.

### P2 — Database & Multi-Tenancy Foundation *(ref Day 2–4)* — ✓ DONE
- **Entry:** P1 done; **D2, D3, D4 ruled.**
- **Governing docs:** DATABASE_FOUNDATION, MULTI_TENANT_SECURITY.
- **Deliverables:** full canonical schema (DR-01/02), extensions + pgvector index (DR-03), RLS enabled + `client_isolation` policy on tenant tables (NFR-01), app-layer credential-encryption design (SR-04/DR-04), Alembic as schema authority (AUD-04), seed/test data. *Satisfies* DR-01…05, NFR-01, SR-04, SR-06, part SR-02.
- **Risks retired:** RISK-08; foundation for RISK-01.
- **Exit / Done-When:** every table queryable & matches spec; **cross-tenant query under RLS returns ∅**; migration up/down works; schema review signs off (no renames).

### P3 — FastAPI Backend, Auth, Pool & Tenant Context *(ref Day 4–8)* — ✓ DONE
- **Entry:** P2 done; **D1 ruled.**
- **Governing docs:** BACKEND_ARCHITECTURE, MULTI_TENANT_SECURITY.
- **Deliverables:** async FastAPI app + routers (CLAUDE §10); JWT auth + bcrypt (SR-01); middleware sets `app.current_client_id` (SR-02); **shared asyncpg pool + mandatory tenant-context-on-checkout helper + isolation test** (AUD-05/08); background-task dispatch (NFR-02); CORS; error handling; audit scaffolding (SR-05); AUD-02 DSN handling. *Satisfies* SR-01/02/05, NFR-02, part NFR-05, the n8n API contract.
- **Risks retired:** **RISK-01, RISK-02**; part RISK-12.
- **Exit / Done-When:** `/docs` shows all endpoints; JWT passes; **trigger endpoint < 100ms**; **isolation test proves a pooled/background connection cannot read another tenant's rows**; AUD-02 resolved.

### P4 — LangGraph Agents *(ref Day 8–18; sub-phased)* — ◧ CODE-COMPLETE (not operationally verified)
- **Entry:** P3 done (pool + tenant context mandatory).
- **Governing docs:** AGENT_ARCHITECTURE (+ MCP for P4b/c, RAG for node insertion).
- **P4a VoC:** graph fetch→nlp→cluster→narrative→check_alert→store; LangSmith (NFR-03); per-node unit tests; injection hardening (AUD-11/RISK-05). *Satisfies* FR-VOC-01…05. *Done-When:* VoC traces succeed; insights persisted; `raw_feedback` drains; **run < 60s**.
- **P4b CompSig:** graph fetch_competitors→mine→classify→context→flag→store; consumes P5 tools. *Satisfies* FR-CSE-01…05. *Done-When:* traces succeed; signals persisted; **run < 45s**.
- **P4c Journey:** graph fetch_events→funnels→dropoffs→diagnose→recommend→store. *Satisfies* FR-BJI-01…04. *Done-When:* journey insights persisted; traces succeed.
- **Cross-cutting exit:** all three idempotent & broker-portable (RISK-04); batching/limits enforced (RISK-03); **LangSmith = 3 healthy agents**.
- **Status (2026-06-08) — CODE-COMPLETE, operationally unverified:**
  - All three agents implemented as LangGraph `StateGraph`s with the canonical node order above, `@traceable` entry points, `acquire_for_client` + explicit `client_id` on every query, injection-fenced prompts, and defensive output validation. Wired to their routers via the background-dispatch pattern. **148 tests pass** (unit + E2E with mocked LLM + tenant-isolation + no-key fail-safe).
  - **Remaining to mark P4 fully DONE:** (1) live `OPENAI_API_KEY`/`LANGCHAIN_API_KEY` set so real runs produce **LangSmith traces** (NFR-03 exit criterion) — keys now configured in `.env`, traces not yet captured; (2) perf verification (VoC < 60s / CompSig < 45s) against real data; (3) **P5 dependency**: `comp_signal_agent.mine_signals` is a clean P5 stub returning `[]` — CompSig persists **no real signals until P5 MCP tools exist**. Journey runs on existing `journey_events`; VoC runs on existing `raw_feedback`.

### P5 — MCP Tool Layer *(ref Day 12–16, parallel with P4)*
- **Entry:** P2 (`data_sources` + encryption); **D5 scraping policy ruled.**
- **Governing docs:** MCP_ARCHITECTURE.
- **Deliverables:** ≥5 tools across the official catalog (CLAUDE §8), registry, per-client dynamic resolution (OR-04), encrypted-cred retrieval (SR-04), per-source backoff/retry (RISK-10), normalized outputs. *Satisfies* OR-04, FR-CSE-02, FR-BJI-01, DR-04.
- **Risks retired:** part RISK-06, RISK-10.
- **Exit / Done-When:** each tool returns normalized data; `get_tools_for_client` returns only connected sources; scrapers within legal policy.

### P6 — n8n Workflows, Reports & Alerts *(ref Day 14–18)*
- **Entry:** P3 endpoints + P4 agent-run endpoints stable.
- **Governing docs:** INFRASTRUCTURE_ARCHITECTURE (§5 workflows), BACKEND (endpoint contract).
- **Deliverables:** the **4 workflows** (ingestion, competitive monitor, weekly report, churn webhook); Resend delivery; report → S3 + PDF (FR-RPT-03; **AUD-10 engine chosen**); workflows exported as versioned JSON. *Satisfies* OR-03, FR-VOC-04 (alert path), FR-CSE-05, FR-RPT-01/02/03.
- **Risks retired:** RISK-04 (re-trigger sweeps), part RISK-11.
- **Exit / Done-When:** a scheduled workflow fires and completes without error; weekly brief email + threshold alerts delivered; PDF stored in S3 with a working link.

### P7 — RAG Knowledge Base *(ref Day 16–20)*
- **Entry:** P2 (pgvector), P4 agents functional.
- **Governing docs:** RAG_ARCHITECTURE.
- **Deliverables:** central embedding service (single path, OR-05); seed knowledge (approved sources only, CLAUDE §9); `rag_context` node inserted **before** narrative; tenant+global retrieval. *Satisfies* OR-05; enriches FR-VOC-05, FR-CSE-04.
- **Risks retired:** baseline for RISK-09.
- **Exit / Done-When:** VoC narrative references retrieved context; **no duplicate RAG path exists**; similarity query returns sensible results.

### P8 — Next.js Client Portal + SSE *(ref Day 18–28)*
- **Entry:** P3 API + P4 persisted data.
- **Governing docs:** FRONTEND_ARCHITECTURE.
- **Deliverables:** 5 core pages + detail routes (FR-DASH-01/02); typed API client; server-first rendering (ADR-007); SSE real-time (FR-DASH-03, NFR-06); settings/onboarding entry (FR-ONB-01). *Satisfies* FR-DASH-*, FR-ONB-01, NFR-06, part NFR-05.
- **Risks retired:** part RISK-13.
- **Exit / Done-When:** client logs in and sees live tenant data; **new insight appears via SSE without refresh**; dashboard load **< 1.5s**; no client-side polling.

### P9 — Docker & AWS Deployment *(ref Day 25–32)*
- **Entry:** all services containerized; Secrets Manager populated.
- **Governing docs:** INFRASTRUCTURE_ARCHITECTURE.
- **Deliverables:** ECS Fargate services (backend autoscale 2→10), ALB/CloudFront, RDS (pg16+pgvector), S3, ECR, CloudWatch, Secrets Manager (OR-02, SR-03); secret rotation (AUD-12); n8n single-task + persistent storage (RISK-11). *Satisfies* OR-02, NFR-04, SR-03, part SR-04/05.
- **Risks retired:** part RISK-12, RISK-11.
- **Exit / Done-When:** `app.dataautomated.io` live; logs in CloudWatch; **autoscaling verified under load model**.

### P10 — QA, Performance & Hardening *(ref Day 30–35, continuous)*
- **Entry:** spans all phases; **hard final gate after P9.**
- **Governing docs:** all (verification sections); CLAUDE §16.
- **Deliverables:** unit/agent/integration tests (CLAUDE §16); performance benchmark suite (§1.8); **load test at the 500-client model** (validates RISK-01/02/03); compliance review (RISK-15); daily operational checklist live.
- **Exit / Done-When (GA bar):** all tests pass; all §1.8 benchmarks met; **0 failed LangSmith runs in 48h**; no open critical/high bugs; isolation load-test clean.

---

## 6. The §1.8 performance gates (where each is verified)

| Target | Threshold | Verified in |
|---|---|---|
| `GET /api/dashboard/summary` | < 300 ms | P8, P10 |
| `POST /api/agents/voc/run` (trigger) | < 100 ms (async) | P3, P4 |
| VoC full run (500 items) | < 60 s | P4, P10 |
| CompSig full run | < 45 s | P4, P10 |
| Next.js dashboard page load | < 1.5 s | P8, P10 |

---

## 7. What is deliberately deferred (tracked, not dropped — MASTER_ROADMAP §1.9)

- **v1.1 enhancements:** FR-CSE-06 (Win/Loss), FR-BJI-06 (Simulation/Personalization), VoC Churn-system depth.
- **Post-MVP roadmap modules (DO NOT build in MVP — CLAUDE §1):** Revenue Intelligence (v1.2), AI Analyst Chat (v1.2), Demand Forecasting (v1.3), A/B Test Designer (v1.3), Multi-Market (v2.0).
- **Architectural deferrals:** broker-based task durability (ADR-005/AUD-06), event-on-persist SSE (ADR-012/AUD-07), deep ML depth (AUD-09), pgvector extraction to a dedicated ANN store (RISK-09).
- **Rule:** these MUST NOT be started during MVP; if a request implies one, **STOP and confirm scope** (CLAUDE §1, §18).

---

## 8. Change control (CLAUDE §18; MASTER_ROADMAP §5.13)

Any deviation from `CLAUDE.md` (stack, schema, RLS, structure) or any new tech choice (e.g., the flagged Alembic, WeasyPrint) requires a **recorded decision** via the §18 framework. The flagged defaults in §4 are the enumerated decisions (D1–D6 + AUD-10/12) to ratify. **Next action after blueprint + roadmap approval: begin P1 only**; each subsequent phase starts after the prior phase's exit criteria pass.

---

*DataAutomated.io — IMPLEMENTATION_SEQUENCE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Fuses CLAUDE.md §19 with MASTER_ROADMAP §4/§5.*
