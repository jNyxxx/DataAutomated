# INFRASTRUCTURE_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for how the system is containerized, deployed, scaled, orchestrated, and secured in production — meeting the 500-client mandate with a small operational footprint. Includes the n8n automation contract and the secrets model.
> **Governing sources:** `CLAUDE.md` §15 (deployment), §13 (n8n standards), §14 (secrets), §3 (infra stack); `ARCHITECTURE_DECISION_RECORDS.md` ADR-008 (Docker + ECS Fargate), ADR-006 (n8n), §4.4 (event-driven theme); `MASTER_ROADMAP.md` OR-01/02/03, SR-03, NFR-04, AUD-10 (PDF), AUD-12 (secrets), RISK-11 (n8n SPOF), RISK-12 (secret compromise).
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (n8n endpoint contract) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (secrets/KMS) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (RDS) · [FRONTEND_ARCHITECTURE](FRONTEND_ARCHITECTURE.md) (CloudFront).
> **Scope boundary:** No Dockerfiles, compose files, or IaC as deliverables. This fixes the topology, container specs, scaling model, deploy flow, and n8n workflow contract the P1/P6/P9 work realizes.

---

## 1. Why containers on ECS Fargate (ADR-008)

The system is several distinct runtimes (API, frontend, orchestration, database) that must deploy reproducibly and scale to absorb bursty, high-latency agent traffic at 500 clients — **without a dedicated platform/SRE team** (ADR-008 context). The decision: **one container per service** on **AWS ECS Fargate**, autoscaling the stateless backend, fronted by ALB + CloudFront, backed by managed data services (ADR-008; CLAUDE §15).

> **RULE:** new services are **stateless and container-per-service** to inherit autoscaling; any new **stateful** service inherits the "single-task + persistent storage" caveat and must justify it (ADR-008 future constraint).

---

## 2. Containers (one per service — OR-01 / CLAUDE §15)

| Service | Base image | Serves | Notes |
|---|---|---|---|
| **Backend** | `python:3.11-slim` | `:8000` | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers …`; async (ADR-001); stateless |
| **Frontend** | multi-stage `node:20-alpine` | `:3000` | Next.js **standalone** build (FRONTEND); stateless |
| **DB (local/dev)** | `pgvector/pgvector:pg16` | `:5432` | Local mirror of prod RDS (DATABASE_FOUNDATION) |
| **n8n** | `n8nio/n8n:latest` | `:5678` | **Stateful**, single instance (§5) |

- Local dev via `docker-compose.yml`; production overrides in `docker-compose.prod.yml`. **`docker-compose up` must start all services** (Phase-1 done-criterion; OR-01).
- `.env.example` is committed; **`.env` is never committed** (CLAUDE §14, §17; SR-03).

---

## 3. AWS production topology (reproduced from CLAUDE §15)

```
Route 53 (DNS)
  → app.dataautomated.io → CloudFront → ECS Frontend
  → api.dataautomated.io → ALB        → ECS Backend (2+ tasks)

ECS Cluster (Fargate):
  → Backend Service:  FastAPI  (2 tasks min, auto-scale to 10)
  → Frontend Service: Next.js  (2 tasks min)
  → n8n Service:      n8n      (1 task, persistent EFS storage)

RDS:             PostgreSQL 16 + pgvector (db.t4g.medium to start)
S3:              dataautomated-reports (PDF storage)
ECR:             container registry
Secrets Manager: all env vars + API keys (never hardcode)
CloudWatch:      logs from all containers
```

- **Backend autoscales 2→10 tasks** behind the ALB; every request and agent is **horizontally scalable and stateless** (state lives in PostgreSQL/S3), per the 500-client Prime Directive (NFR-04; ADR-008).
- **Frontend** min 2 tasks behind CloudFront.
- **RDS** is PostgreSQL 16 + pgvector (`db.t4g.medium` to start); the single unified store (DATABASE_FOUNDATION §1; OLTP + vector contend on one instance — ADR-003 trade-off).
- **S3** `dataautomated-reports` holds generated PDFs (`reports.s3_key`).
- **CloudWatch** is the centralized log sink for all containers and the data-access audit substrate (MULTI_TENANT_SECURITY §7; SR-05).
- **LangSmith tracing is active on all agent runs in production** (CLAUDE §15; NFR-03; AGENT §5).

---

## 4. Reports & S3 (FR-RPT / AUD-10)

- The report service renders periodic reports to **PDF → S3**, and a `reports` row records the `s3_key`; n8n then delivers a download link via Resend (CLAUDE §13; SYSTEM §4.4).

> **DEFAULT (pending ratification — AUD-10):** PDF engine = **WeasyPrint** (server-side HTML→PDF), chosen for a server-rendered → S3 pipeline. It is **not in the approved §3 stack list** and therefore **requires CLAUDE §3 approval**; flagged here. Alternative noted: headless **Playwright** print-to-PDF. Selected in P6/P9 (AUD-10).

---

## 5. n8n orchestration & the stateful exception (ADR-006 / RISK-11)

n8n is the **cron/trigger + delivery** layer — **it does no AI work** (CLAUDE §13; ADR-006). Division of responsibility is strict: **n8n decides *when* and *where*; FastAPI/LangGraph decide *what*** (ADR §6; SYSTEM §3). Analysis logic must never creep into n8n, and agent orchestration must never move out of FastAPI into n8n (CLAUDE §13).

- **Stateful SPOF (deliberate):** n8n runs as a **single task with persistent EFS** — it is the one exception to the stateless pattern and **cannot simply be scaled out** (ADR-008 consequence). Mitigations (RISK-11): persistent storage + backups, restart policy, idempotent workflows, monitoring. Do not run multiple n8n tasks without rework (CLAUDE §15).
- **Auth:** webhook auth via `N8N_WEBHOOK_SECRET`; n8n basic auth enabled (CLAUDE §13).
- **Version control:** workflows are built locally (`http://localhost:5678`), **exported to JSON in `n8n/workflows/`**, and committed; production runs the exports (CLAUDE §13; PROJECT_STRUCTURE §3).

### The four official workflows (build these — CLAUDE §13)
| # | Workflow | Trigger → flow | Endpoints (BACKEND §3 contract) |
|---|---|---|---|
| 1 | **Daily Feedback Ingestion** | every 6h → list clients → loop → ingest → if `ingestion_count > 0` → run VoC | `GET /api/clients/active-list`, `POST /api/ingest/trigger`, `POST /api/agents/voc/run` |
| 2 | **Competitive Signal Monitor** | every 2h → list monitored clients → loop → run CompSig → if `urgency = "critical"` → Slack `#client-alerts` + Resend | `GET /api/clients/with-competitive-monitoring`, `POST /api/agents/competitive-signal/run` |
| 3 | **Weekly Report Generation** | Mon 9:00 → list clients → loop → generate report (`weekly_intelligence`, `last_7_days`) → Resend with S3 link | `GET /api/clients/active-list`, `POST /api/reports/generate` |
| 4 | **Churn Alert (webhook)** | `POST /webhook/churn-alert` {client_id, churn_risk_score, top_themes} → `> 0.25` URGENT Resend + Slack `#churn-monitor`; else `> 0.15` standard Resend | `POST /webhook/churn-alert` (fired by VoC agent) |

> **CONTRACT:** the endpoint paths above are a published interface; **renaming requires a coordinated workflow change in the same PR** (ADR-006; CLAUDE §13; BACKEND §3).

---

## 6. Secrets & encryption (SR-03 / AUD-12 / RISK-12)

- **All production secrets/API keys live in AWS Secrets Manager**; config loads via `pydantic-settings`; nothing hardcoded; `.env` git-ignored (CLAUDE §14; SR-03).
- **Per-client integration credentials** live in `data_sources.credentials` as **app-layer AES-256 ciphertext**, with a **KMS-backed key** (MULTI_TENANT_SECURITY §6; MCP §5; SR-04).

> **DEFAULT (AUD-12 / RISK-12):** secret rotation plan for the JWT signing key + per-client creds; short JWT TTL (60 min); least-privilege IAM for ECS task roles; KMS for the credential-encryption key. Designed in P3, hardened in P9.

---

## 7. Deployment flow (CLAUDE §15)

- Build → tag → **push images to ECR**, then `aws ecs update-service … --force-new-deployment` per service.
- Every request and agent is stateless/horizontally scalable so a rolling task replacement is safe (ADR-008; NFR-04).
- Local↔prod parity comes from identical containers (`docker-compose.yml` dev, `docker-compose.prod.yml` overrides; same images promoted to ECS).

---

## 8. Scalability model (NFR-04 — the Prime Directive at the infra layer)

- **Stateless tiers** (backend, frontend) autoscale on load; the backend's async I/O multiplexing lets the 2-task baseline absorb bursty high-latency traffic and scale linearly to 10 (ADR-001/008).
- **Single store** keeps operations simple at scale (one backup/restore, one pool story — ADR-003); RDS instance class scales vertically as a lever before any architectural change.
- **n8n** is the known scaling exception (single task) — kept idempotent and re-trigger-capable so it remains the orchestration chokepoint by design, not by accident (RISK-11; ADR-008).
- **Validated under a 500-client load model in P10** (NFR-04; MASTER_ROADMAP §5.12).

---

## 9. Verification (P1 + P9 done-when — MASTER_ROADMAP §5.3/§5.11)

- **P1:** `docker-compose up` starts all service stubs; repo matches CLAUDE §4; no secrets in VCS (OR-01; SR-03).
- **P9:** `app.dataautomated.io` live in production; logs in CloudWatch; **autoscaling verified under the load model** (OR-02; NFR-04); n8n single-task + persistent storage operational (RISK-11); secret rotation plan in place (AUD-12); PDF stored in S3 with a working link (FR-RPT-03).

---

*DataAutomated.io — INFRASTRUCTURE_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces CLAUDE.md §13/§15; governed by ADR-008/006.*
