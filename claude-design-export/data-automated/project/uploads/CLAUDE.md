# CLAUDE.md — DataAutomated.io Project Constitution

> **Status:** Authoritative. Version 1.0 | June 2026 | Confidential — Engineering Use Only
> **Sources of truth:** `DataAutomated.io Product Brief v1.0` + `DataAutomated.io Technical Build Guide for Junex`.
> **Authority of this file:** This document is the operating constitution for every Claude Code session on this repository. It is a faithful transformation of the two source documents into enforceable engineering rules. Where this file states a rule, that rule is **final** unless a human maintainer explicitly approves a deviation in writing.

---

## HOW TO USE THIS FILE (READ FIRST, EVERY SESSION)

1. This file is the **single source of governance**. The Product Brief defines *what* and *why*; the Build Guide defines *how* and *in what order*. This file fuses both.
2. Treat every decision below — naming, schema, architecture, stack, folder layout, build order — as **already decided**. Do not relitigate it.
3. If a request conflicts with this file, **STOP** and surface the conflict (see §18 Engineering Decision Framework). Do not silently comply, and do not silently deviate.
4. When the source documents are silent on a detail, choose the option most consistent with the **Prime Directive** (below) and flag the assumption.
5. The north-star evaluation metric, quoted verbatim from the Build Guide, governs all judgment calls:

> **PRIME DIRECTIVE:** *"You are evaluated on one metric — deploying stable, scalable, automated systems that drive revenue. Every architectural decision you make should ask: 'Will this hold up at 100 clients? At 500?' If the answer is no, redesign it now."*

---

## 1. PROJECT OVERVIEW

### What DataAutomated.io Is
DataAutomated.io is an **AI-powered business intelligence platform** that gives SaaS companies and eCommerce brands the *intelligence layer* they are missing — turning scattered customer feedback, competitor activity, and user behavior into clear, actionable decisions. It is delivered as a **managed SaaS platform**: clients connect their data sources and the platform handles everything from ingestion to insight. **No in-house data team is required.**

The platform's defining differentiator is **interpretation, not just data** — every output includes a plain-language explanation of what a finding means, why it matters, and what action is recommended.

### Core Mission
Close the three intelligence gaps that cost SaaS and eCommerce companies revenue every day:
- **Gap 1 — They can't hear their customers clearly.** Feedback is buried across tickets, reviews, NPS, email, social. Never synthesized.
- **Gap 2 — They can't see what competitors are doing.** Pricing, launches, and positioning shifts surface too late to respond.
- **Gap 3 — They can't understand *why* users behave as they do.** Dashboards show drop-off; they never show the cause.

### Business Goals
- AI-native by design (AI is the core of every pipeline, not a bolted-on feature).
- Fast time-to-value: **first meaningful insight within 14 days** of kickoff.
- Outcome-oriented engagement measured by business outcomes, not technical deliverables.
- End-to-end ownership: one vendor, one relationship, one accountability point.
- **Scale to 500+ clients** without redesign (see Prime Directive).

### Target Customers
| Tier | Segment | Size | Buyer |
|---|---|---|---|
| **Primary** | SaaS Companies | $500K–$15M ARR | VP Product, Head of Growth, Founder-CEO; 10–150 employees |
| **Secondary** | eCommerce Brands | $2M–$25M GMV | Head of eCommerce, Director of Growth, Brand Owner; Shopify/WooCommerce |
| **Tertiary** | Mid-Market Enterprises | $15M–$100M revenue | Product/strategy/marketing teams needing AI analytics without 12-month IT builds |

### Pricing Plans (drives the `clients.plan` field — see §5)
| Plan | Price | Services Included |
|---|---|---|
| **Insight Starter** (`insight_starter`, default) | $1,497/mo | 1 intelligence service of choice, monthly report, email alerts |
| **Intelligence Core** | $2,997/mo | All 3 services, weekly briefings, Slack integration, real-time alerts |
| **Strategic Suite** | $5,497/mo | All 3 services + Win/Loss integration + Churn Early Warning, dedicated analyst |
| **Enterprise** | Custom | Custom data infrastructure, SLA, multi-team dashboards, co-pilot model |

### The Three Intelligence Services (the heart of the product)

**1. Voice-of-Customer (VoC) Platform** — *Turn qualitative chaos into a quantitative competitive edge.*
Ingests every customer signal across every channel and transforms it into structured, prioritized, actionable insight. Capabilities: Omnichannel Aggregation, Sentiment & Intent Modeling, Theme Taxonomy Engine, Temporal Trend Tracking, Behavioral Feedback Linkage, Executive Insight Layer. **v1.1 Enhancement — Churn Early Warning System** (continuously scores emotional trajectory of each cohort; fires a churn risk alert 2–4 weeks ahead of revenue impact, with driving themes + recommended intervention).

**2. Competitive Signal Engine** — *Always know what your market knows, before it knows it.*
Runs 24/7 scanning thousands of sources, delivering interpreted signals with strategic context. Capabilities: Multimodal Signal Mining (SEC filings, press, news, jobs, patents, funding, G2/Capterra, Reddit, LinkedIn, X, product pages), ML Pattern Recognition, Patent & Innovation Pipeline Mapping, Market Trend Decomposition, Automated Alerts & Briefings, Strategy Alignment Layer. **v1.1 Enhancement — Win/Loss Intelligence Integration** (ingests CRM notes, call transcripts, closed/lost data; cross-references win/loss against competitor moves).

**3. Behavioral Journey Intelligence Suite** — *Go beyond conversion rates; engineer experiences that flow.*
Reconstructs real user journeys and shows *why* users drop off and exactly what to change. Capabilities: Full-Fidelity Journey Mapping, ML-Driven Funnel Diagnostics, Micro-Event Intelligence (scroll depth, hover, rage clicks, input hesitation), Cohort Performance Comparison, Journey Simulation Engine, Cross-Team Dashboards. **v1.1 Enhancement — Personalization Path Engine** (identifies behavioral archetype within first 3 sessions; recommends optimal path).

### MVP Scope (what we are building NOW)
Three core deliverables only:
1. **Client Intelligence Dashboard** (Next.js portal) — clean, data-dense, real-time; surfaces all three services in one place.
2. **AI Intelligence Agents** (LangGraph + Python) — three agents, one per service; ingest continuously, run NLP/ML, generate plain-language narratives, trigger alerts. Fully observable in LangSmith.
3. **Data Integration Layer** (n8n + MCP) — pre-built n8n workflows feeding processed data into the pipeline; MCP connectors extend agent reach to external APIs.

### Out of Scope for MVP (Post-Launch Roadmap — DO NOT build without approval)
- Revenue Intelligence Layer (v1.2), AI Analyst Chat Interface (v1.2)
- Predictive Demand Forecasting (v1.3), Automated A/B Test Designer (v1.3)
- Multi-Market Intelligence (v2.0)

> **RULE:** Claude MUST NOT begin work on any post-launch roadmap module during MVP. If a request implies one, STOP and confirm scope.

---

## 2. NON-NEGOTIABLE ARCHITECTURAL PRINCIPLES

These are hard rules. Violating any one is a defect, regardless of whether tests pass.

- **MUST** design multi-tenant first. Every client-scoped table carries `client_id`; every query is tenant-scoped.
- **MUST** enforce client isolation as the highest-priority invariant. No feature may cross tenant boundaries.
- **MUST** enable and rely on PostgreSQL Row-Level Security (RLS) for tenant data; application code is the second line of defense, never the only one.
- **MUST** set `app.current_client_id` at the start of every authenticated request before any tenant-table query runs.
- **MUST** be async-first across the backend (FastAPI + asyncpg). AI agent calls take 5–30 seconds.
- **MUST NOT** run a LangGraph agent synchronously inside an HTTP request. Agents run via background tasks / dispatch; the request returns immediately.
- **MUST** make every AI workflow observable. LangSmith tracing is active on every agent run in every environment.
- **MUST NOT** let any feature bypass tenant boundaries, RLS, or the audit trail.
- **MUST** store derived insights, not raw customer source data, as the long-term record. Source data is processed in transit; insights are persisted (per Zero-Trust / "no raw customer data stored" principle).
- **MUST** encrypt all stored third-party credentials at the application layer (AES-256) before they touch the database.
- **MUST** design every component to hold at **100 and 500 clients**. If a design won't, redesign it now.
- **MUST NOT** hardcode secrets. All secrets come from environment / AWS Secrets Manager.
- **MUST** maintain a complete audit trail for all data access and AI agent actions.

---

## 3. APPROVED TECHNOLOGY STACK

This is the **official stack**. Anything not listed here is **forbidden unless a human maintainer explicitly approves it**. Do not introduce alternative frameworks, ORMs, vector stores, or cloud primitives on your own initiative.

### Backend & AI
| Technology | Role | Why (per source docs) | Forbidden alternatives (without approval) |
|---|---|---|---|
| **Python 3.11** | Backend language | Confirmed stack; ecosystem for AI/ML and async | Other backend languages |
| **FastAPI** | REST API + AI orchestration | Async-first — critical for 5–30s agent calls | Flask, Django, Express, etc. |
| **asyncpg** | PostgreSQL driver | Async DB access matching FastAPI | psycopg2 (sync), other drivers in hot paths |
| **PostgreSQL 16** | Primary data store | Multi-tenant relational store with RLS | MySQL, Mongo, DynamoDB as primary store |
| **pgvector** | Vector storage / RAG | Embeddings live next to relational data | Pinecone, Weaviate, Chroma, FAISS as primary |
| **LangGraph** | Stateful multi-step agent workflows | Graph-structured, stateful agents (not simple chains) | Raw LangChain chains, custom agent loops |
| **LangSmith** | Agent observability | Full trace logging of every run in production | Ad-hoc logging as a replacement |
| **OpenAI** | LLM + embeddings | `gpt-4o` (analysis/narrative), `text-embedding-3-small` (1536-dim embeddings) | Swapping model providers without approval |

> NLP/interpretation layer per Product Brief: transformer models (BERT/RoBERTa for NLP, custom fine-tuned LLMs for interpretation). MVP implementation uses OpenAI `gpt-4o` for NLP extraction and narrative generation as specified in the Build Guide.

### Frontend & Client Portal
| Technology | Role | Why | Forbidden alternatives |
|---|---|---|---|
| **Next.js (App Router, 14+)** | Client dashboard | Server Components, fast, data-dense portals | Pages Router, CRA, Vite SPA without approval |
| **TypeScript (strict)** | Frontend language | Type safety across the portal | Plain JS |
| **Tailwind CSS** | Styling | Confirmed stack | Other CSS frameworks |
| **Recharts** | Data visualization | All charts use Recharts | Chart.js, D3 direct, Victory, etc. |
| **Resend** | Automated report/email delivery | Confirmed stack | SendGrid, SES-direct without approval |

### Automation
| Technology | Role | Why | Forbidden alternatives |
|---|---|---|---|
| **n8n** | Trigger-based automation | Cron/webhook layer: ingestion, alerts, reporting | Celery/Airflow/custom cron for these jobs without approval |

### Infrastructure
| Technology | Role | Why | Forbidden alternatives |
|---|---|---|---|
| **Docker** | Containerization | Reproducible, one container per service | Non-containerized deploys |
| **AWS ECS (Fargate)** | Orchestration | Auto-scaling, ALB routing | EKS/k8s, Lambda for services, other clouds without approval |
| **AWS RDS (PostgreSQL 16 + pgvector)** | Managed DB | Production database | Self-managed DB without approval |
| **AWS S3** | Report/document storage | PDF + document store | Other object stores |
| **AWS ECR** | Container registry | Image storage | Other registries |
| **AWS CloudWatch** | Logs/metrics | Centralized observability | Replacing as primary log sink without approval |
| **AWS Secrets Manager** | Secret storage | All env vars/API keys in production | Hardcoded secrets, plaintext config |

### Auth — KNOWN DISCREPANCY (requires human ruling before building auth)
The two source documents differ and this **must be resolved by a maintainer before implementing authentication**:
- **Product Brief** lists **Clerk** for authentication and user management.
- **Technical Build Guide** implements **custom JWT** (`python-jose` + `passlib[bcrypt]`), with a `users` table (`hashed_password`), `/auth/token` login, and `get_current_user` dependency. The frontend `lib/api.ts` comment says *"Implement with next-auth or Clerk."*

**Default until ruled otherwise:** Follow the **Build Guide's custom-JWT backend** (it is the concrete implementation spec and the `users` table exists for it), optionally fronted by Clerk for frontend session/user management. **Do not delete the `users` table or the JWT machinery to switch to Clerk-only without explicit approval.** Flag this in any auth-related PR.

---

## 4. REPOSITORY STRUCTURE

This is the **exact approved structure** from the Build Guide. Reproduce it precisely.

```
dataautomated/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Environment config (pydantic-settings)
│   │   ├── database.py             # DB connection pool (asyncpg)
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── client.py
│   │   │   ├── insight.py
│   │   │   ├── signal.py
│   │   │   └── journey.py
│   │   ├── routers/                # FastAPI route handlers
│   │   │   ├── auth.py
│   │   │   ├── insights.py
│   │   │   ├── signals.py
│   │   │   └── journeys.py
│   │   ├── agents/                 # LangGraph agent definitions
│   │   │   ├── voc_agent.py
│   │   │   ├── comp_signal_agent.py
│   │   │   └── journey_agent.py
│   │   ├── tools/                  # MCP tool definitions
│   │   │   ├── zendesk_tool.py
│   │   │   ├── typeform_tool.py
│   │   │   └── scraper_tool.py
│   │   └── services/               # Business logic layer
│   │       ├── nlp_service.py
│   │       ├── embedding_service.py
│   │       └── report_service.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                        # Next.js App Router
│   │   ├── dashboard/
│   │   ├── insights/
│   │   ├── signals/
│   │   └── journeys/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   └── Dockerfile
├── n8n/
│   └── workflows/                  # Exported n8n workflow JSON files
├── docker-compose.yml              # Local dev environment
├── docker-compose.prod.yml         # Production overrides
└── .env.example
```

**Rules:**
- Claude **MUST** follow this structure exactly. New files belong in the matching existing folder.
- Claude **MUST NOT** introduce new top-level folders without explicit justification and approval. (A `tests/` directory at `backend/tests/` is permitted and expected per §16; `app/tools/registry.py` and `app/tools/base_tool.py` are permitted as they are named in the Build Guide.)
- Agents live only in `backend/app/agents/`. Tools only in `backend/app/tools/`. Business logic only in `backend/app/services/`. Routes only in `backend/app/routers/`.
- Frontend routes are App Router segments under `frontend/app/`. Shared UI in `frontend/components/`, client/data utilities in `frontend/lib/`.
- n8n workflows are version-controlled as exported JSON in `n8n/workflows/`.

---

## 5. DATABASE GOVERNANCE

The database is the foundation. **Get it right before writing a single API route.** This section is intentionally strict.

### Conventions (mandatory)
- **Primary keys:** every table uses `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`. Requires the `uuid-ossp` extension.
- **Timestamps:** always `TIMESTAMPTZ` (timezone-aware). Creation columns are `created_at TIMESTAMPTZ DEFAULT NOW()`. Other time columns: `ingested_at`, `occurred_at`, `detected_at`, `last_synced_at`, `period_start`, `period_end`.
- **Tenant key:** every client-scoped table has `client_id UUID REFERENCES clients(id) ON DELETE CASCADE`. (Exception: `knowledge_embeddings.client_id` is **nullable** — `NULL` means global knowledge — and references `clients(id)` without cascade.)
- **Naming:** tables are `snake_case` plural-ish per the schema below; columns are `snake_case`. Enumerable string fields use `VARCHAR(n)` with documented allowed values (e.g., `urgency`, `sentiment_label`, `role`, `signal_type`, `friction_cause`).
- **JSONB usage:** use `JSONB` for semi-structured, source-shaped, or evolving data — `credentials`, `config`, `metadata`, `themes`, `properties`. Do **not** use JSONB to smuggle relational data that belongs in columns, and do **not** store tenant identifiers only inside JSONB (they must be first-class `client_id` columns for RLS).
- **Foreign keys:** explicit `REFERENCES` with `ON DELETE CASCADE` for client-owned data so deleting a client removes its data. `data_sources` is referenced by `raw_feedback.source_id` (no cascade declared there — preserve as written).
- **pgvector:** embeddings are `vector(1536)` (matches `text-embedding-3-small`). The similarity index is `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`. Cosine distance operator `<=>` is used for retrieval.
- **Extensions required:** `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

### Official Schema (canonical — reproduce exactly)

```sql
-- CLIENTS (one row per DataAutomated.io customer)
CREATE TABLE clients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    plan        VARCHAR(50) DEFAULT 'insight_starter',
    api_key     VARCHAR(255) UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT TRUE
);

-- USERS (client team members who access the portal)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role            VARCHAR(50) DEFAULT 'viewer',  -- 'admin', 'analyst', 'viewer'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- DATA SOURCES (client's connected tools)
CREATE TABLE data_sources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
    source_type     VARCHAR(100) NOT NULL,  -- 'zendesk', 'typeform', 'mixpanel', etc
    credentials     JSONB,                  -- Encrypted at app layer before storing
    config          JSONB,                  -- Source-specific config (filters, webhooks)
    last_synced_at  TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RAW FEEDBACK (ingested customer feedback, any source)
CREATE TABLE raw_feedback (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
    source_id    UUID REFERENCES data_sources(id),
    source_type  VARCHAR(100),
    external_id  VARCHAR(255),              -- ID from the originating platform
    content      TEXT NOT NULL,
    metadata     JSONB,                     -- author, timestamp, rating, channel
    ingested_at  TIMESTAMPTZ DEFAULT NOW(),
    processed    BOOLEAN DEFAULT FALSE
);

-- FEEDBACK INSIGHTS (VoC agent output)
CREATE TABLE feedback_insights (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
    feedback_ids    UUID[],                 -- Source raw_feedback IDs analyzed
    sentiment_score FLOAT,                  -- -1.0 to 1.0
    sentiment_label VARCHAR(50),            -- 'positive', 'negative', 'neutral', 'mixed'
    urgency_score   FLOAT,                  -- 0.0 to 1.0
    themes          JSONB,                  -- [{"theme": "onboarding", "count": 42, ...}]
    narrative       TEXT,                   -- AI-generated plain-language summary
    churn_risk      FLOAT,                  -- 0.0 to 1.0
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- COMPETITIVE SIGNALS
CREATE TABLE competitive_signals (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
    competitor_name   VARCHAR(255),
    signal_type       VARCHAR(100),         -- 'pricing', 'product_launch', 'hiring', ...
    signal_source     VARCHAR(255),         -- URL or source name
    raw_content       TEXT,
    strategic_context TEXT,                 -- AI interpretation of what this means
    urgency           VARCHAR(50),          -- 'critical', 'high', 'medium', 'low'
    detected_at       TIMESTAMPTZ DEFAULT NOW(),
    is_read           BOOLEAN DEFAULT FALSE
);

-- JOURNEY EVENTS (behavioral data)
CREATE TABLE journey_events (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
    session_id   VARCHAR(255),
    user_id      VARCHAR(255),
    event_type   VARCHAR(255),              -- 'page_view', 'click', 'form_start', 'abandon', ...
    properties   JSONB,
    occurred_at  TIMESTAMPTZ,
    ingested_at  TIMESTAMPTZ DEFAULT NOW()
);

-- JOURNEY INSIGHTS (Behavioral Journey agent output)
CREATE TABLE journey_insights (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
    funnel_step    VARCHAR(255),
    drop_off_rate  FLOAT,
    friction_score FLOAT,
    friction_cause VARCHAR(100),            -- 'ux_friction', 'messaging', 'expectation'
    recommendation TEXT,
    projected_lift FLOAT,                   -- Estimated conversion lift if fixed
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- EMBEDDINGS (RAG knowledge base)
CREATE TABLE knowledge_embeddings (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id  UUID REFERENCES clients(id),  -- NULL = global knowledge
    content    TEXT NOT NULL,
    embedding  vector(1536),
    metadata   JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- REPORTS (generated PDFs and dashboards)
CREATE TABLE reports (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
    report_type  VARCHAR(100),              -- 'weekly_voc', 'competitive_brief', 'journey', ...
    s3_key       VARCHAR(500),              -- Path in S3
    period_start TIMESTAMPTZ,
    period_end   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Tables that require client isolation
All of these are tenant-scoped via `client_id` and **must** be tenant-filtered on every access:
`users`, `data_sources`, `raw_feedback`, `feedback_insights`, `competitive_signals`, `journey_events`, `journey_insights`, `reports`, and `knowledge_embeddings` (client-specific rows; `NULL` rows are intentionally global).

### RLS is mandatory
The Build Guide enables RLS on the five core tenant-data tables and provides the canonical policy:

```sql
-- Enable RLS on tenant tables
ALTER TABLE raw_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_insights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_insights    ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own client's data
CREATE POLICY client_isolation ON raw_feedback
    USING (client_id = current_setting('app.current_client_id')::UUID);
-- Repeat the policy for every RLS-enabled table.
```

- **RULE:** Apply the `client_isolation` policy to **every** RLS-enabled table (the guide says "Repeat for all RLS-enabled tables").
- **RECOMMENDED (flag for approval):** extend RLS to the remaining tenant tables (`data_sources`, `reports`, client-specific `knowledge_embeddings`) for defense-in-depth. Do not remove or weaken any existing policy.

### How `current_client_id` must be enforced
At the start of **every authenticated request**, before any tenant-table query, the FastAPI auth middleware sets the session variable:

```python
await conn.execute(
    f"SET app.current_client_id = '{current_user.client_id}'"
)
```

- **RULE:** No tenant query may execute without `app.current_client_id` set for that connection/transaction.
- **SECURITY NOTE (flag, do not silently "fix" against spec):** The Build Guide uses an f-string here. Because `client_id` is a server-derived UUID from the validated JWT (never raw user input), this is acceptable as written; prefer `SET LOCAL` within a transaction and/or `set_config(...)` parameterization when refactoring, and never interpolate untrusted input. Treat the value as trusted only because it comes from the authenticated token.

### Immutable schema rule
> **Claude MUST NEVER rename approved tables or columns, change their types, drop columns, or alter the UUID/timestamp/JSONB/pgvector conventions above without explicit human approval.** Additive, backward-compatible migrations (new nullable columns, new tables that follow these conventions, new indexes) are the only changes permitted without a ruling. All schema changes ship as reviewed migrations.

---

## 6. MULTI-TENANCY RULES

Client isolation is the platform's most important invariant. There are **no exceptions**.

- **MUST:** Every query against a tenant table is scoped to the current client — via RLS *and* an explicit `WHERE client_id = $1` in application/agent SQL (belt and suspenders). The agents in the Build Guide already pass `client_id = $1`; preserve this.
- **MUST:** Every service, agent, tool, and background task operates under an explicit client context (`client_id`). A function that touches tenant data **must** receive `client_id` as an argument or derive it from the authenticated request — never infer or default it.
- **MUST NOT:** Read, join, or aggregate across multiple clients in a single tenant-facing query. Cross-tenant data access is prohibited.
- **MUST NOT:** Expose another client's `id`, `api_key`, data, or derived insights in any response, log line, alert, report, or error message.
- **MUST:** Tools that fetch external data (MCP layer) load **only** the connected sources and credentials for the given `client_id`.
- **MUST:** Background/agent DB connections also set `app.current_client_id` (or filter by `client_id` explicitly) — RLS only protects connections where the session var is set, so a raw `asyncpg.connect` inside an agent **must** still filter by `client_id` (as the reference `fetch_feedback_node` does).

**Correct (tenant-scoped):**
```python
rows = await conn.fetch(
    "SELECT id, content FROM raw_feedback "
    "WHERE client_id = $1 AND processed = FALSE LIMIT 500",
    state["client_id"],
)
```

**Forbidden (no tenant scope — never write this):**
```python
rows = await conn.fetch("SELECT id, content FROM raw_feedback LIMIT 500")  # ❌ leaks across tenants
```

**Forbidden (cross-tenant aggregation in tenant context):**
```python
await conn.fetch("SELECT client_id, AVG(sentiment_score) FROM feedback_insights GROUP BY client_id")  # ❌
```

---

## 7. AGENT ARCHITECTURE

There are **exactly three** official agents, one per intelligence service. Each is a **LangGraph `StateGraph`** — nodes are steps, edges are transitions, typed state flows between nodes. Each is `@traceable` in LangSmith. Each agent runs **asynchronously** (never inside an HTTP request) and persists results to PostgreSQL.

> **RULE:** Claude **extends these three agents**. Claude **MUST NOT** create competing agent frameworks, parallel orchestration layers, or a fourth agent without explicit approval. New capability = a new node or tool inside an existing agent, or a new MCP tool — not a new architecture.

Shared agent contract:
- State is a `TypedDict` carrying `client_id` plus the working fields.
- Graph is built with explicit `add_node` / `add_edge`, `set_entry_point`, terminating at `END`, then `.compile()`.
- The public entry function is `@traceable(name=...)` and is the unit LangSmith traces.
- LLM: `ChatOpenAI(model="gpt-4o", temperature=0)`. NLP batching = 20 items/batch; VoC fetch limit = 500 items.
- Final node persists to the correct insights table and marks source rows processed where applicable.

### 7.1 VoC Agent — `backend/app/agents/voc_agent.py`
**Responsibilities:** Ingest unprocessed customer feedback, run NLP (sentiment/urgency/intent/theme/churn signal), cluster themes, compute churn risk, generate a CEO-grade plain-language narrative, decide whether a churn alert is required, persist results.

**Inputs:** `raw_feedback` rows for the client where `processed = FALSE` (latest 500). Optionally RAG context (§9).

**Outputs:** A `feedback_insights` row (`sentiment_score`, `themes`, `narrative`, `churn_risk`, ...); `raw_feedback.processed` set `TRUE`; a churn alert webhook fired to n8n when `alert_required`.

**State (`VoCState`):** `client_id`, `raw_feedback`, `preprocessed`, `sentiment_results`, `theme_clusters`, `churn_risk_score`, `narrative`, `alert_required` (+ `rag_context` once RAG is added).

**Workflow nodes (canonical order):**
`fetch_feedback` → `nlp_analysis` → `theme_clustering` → (`rag_context`) → `narrative_generation` → `check_alert` → `store_results` → `END`

**Key rules:**
- Churn alert threshold: `alert_required = churn_risk_score > 0.15`. (n8n then escalates: `> 0.25` URGENT, `> 0.15` standard early warning — §13.)
- NLP node returns per-item JSON: `sentiment_score (-1.0..1.0)`, `urgency_score (0.0..1.0)`, `primary_theme`, `intent ('complaint'|'request'|'praise'|'question')`, `churn_signal (bool)`.
- The RAG node, when present, is inserted **before** `narrative_generation` and injects retrieved context into the prompt.

### 7.2 Competitive Signal Agent — `backend/app/agents/comp_signal_agent.py`
**Responsibilities:** Fetch the client's tracked competitors, mine multimodal signals via MCP tools, classify and score signals by type/velocity/relevance, generate strategic context aligned to the client's positioning, flag critical signals, persist.

**Inputs:** Client competitor config; external signals via MCP tools (`scrape_g2_reviews`, `fetch_linkedin_jobs`, `search_news`, `fetch_patent_filings`, etc.).

**Outputs:** `competitive_signals` rows (`competitor_name`, `signal_type`, `signal_source`, `raw_content`, `strategic_context`, `urgency`); critical signals trigger real-time alerts via n8n.

**State (`CompSignalState`):** `client_id`, `competitors`, `raw_signals`, `classified_signals`, `strategic_context`, `critical_signals`.

**Workflow nodes:**
`fetch_competitors` → `mine_signals` → `classify_signals` → `generate_strategic_context` → `flag_critical` → `store` → `END`

### 7.3 Behavioral Journey Agent — `backend/app/agents/journey_agent.py`
**Responsibilities:** Fetch behavioral events, define/reconstruct funnels, compute per-step drop-off, diagnose friction root cause, generate prioritized recommendations with projected conversion lift, persist.

**Inputs:** `journey_events` for the client; MCP tools (`fetch_mixpanel_events`, `fetch_segment_events`, `fetch_shopify_events`).

**Outputs:** `journey_insights` rows (`funnel_step`, `drop_off_rate`, `friction_score`, `friction_cause ∈ {ux_friction, messaging, expectation}`, `recommendation`, `projected_lift`).

**State (`JourneyState`):** `client_id`, `journey_events`, `funnel_steps`, `drop_off_analysis`, `friction_diagnosis`, `recommendations`, `narrative`.

**Workflow nodes:**
`fetch_events` → `define_funnels` → `calculate_dropoffs` → `diagnose_friction` → `generate_recommendations` → `store` → `END`

---

## 8. MCP TOOL SYSTEM

MCP (Model Context Protocol) is how LangGraph agents reach external data sources without bespoke API wrappers scattered through the code. **Define a tool once; call it from any agent.** All external integrations **must** be implemented as MCP-compatible tools.

### Tool implementation requirements
- Each tool lives in `backend/app/tools/` and subclasses `langchain.tools.BaseTool` (see `base_tool.py` pattern).
- Each tool declares a Pydantic `args_schema` (`BaseModel` with `Field(description=...)`) — every argument documented. `client_id` is always an explicit argument.
- Each tool has a stable `name` (the canonical tool name) and a clear `description` telling the agent when to use it.
- Tools fetch **encrypted per-client credentials from the DB** (`data_sources.credentials`), decrypt at the app layer, then call the external API. Credentials never live in code or env for per-client integrations.
- Tools return **normalized** data shaped for the agent (e.g., `[{"id", "content", "metadata": {...}}]`), not raw vendor payloads.

### Tool naming standard
`fetch_*` for API pulls, `scrape_*` for public-page scraping, `search_*` for query-based discovery. Names are `snake_case` and match the registry keys/source types.

### Connector standard & registry pattern
All tools register in a central registry (`backend/app/tools/registry.py`) so agents resolve tools dynamically per client:

```python
TOOL_REGISTRY = {
    "zendesk":  ZendeskFeedbackTool(),
    "typeform": TypeformResponseTool(),
    "intercom": IntercomTool(),
    "g2":       G2ReviewScraper(),
    "news":     NewsSignalTool(),
    "mixpanel": MixpanelEventsTool(),
    "segment":  SegmentEventsTool(),
}

def get_tools_for_client(client_id: str) -> list:
    """Returns only the tools for data sources this client has connected."""
    connected_sources = get_client_data_sources(client_id)
    return [TOOL_REGISTRY[src] for src in connected_sources if src in TOOL_REGISTRY]
```

### Official MVP tool set
| Tool Name | Data Source | Used By |
|---|---|---|
| `fetch_zendesk_feedback` | Zendesk API | VoC Agent |
| `fetch_typeform_responses` | Typeform API | VoC Agent |
| `fetch_intercom_conversations` | Intercom API | VoC Agent |
| `scrape_g2_reviews` | G2 public pages | CompSig Agent |
| `scrape_capterra_reviews` | Capterra public pages | CompSig Agent |
| `search_news_signals` | News API / SerpAPI | CompSig Agent |
| `fetch_linkedin_jobs` | LinkedIn scraper | CompSig Agent |
| `fetch_mixpanel_events` | Mixpanel API | Journey Agent |
| `fetch_segment_events` | Segment API | Journey Agent |
| `fetch_shopify_events` | Shopify API | Journey Agent |

- **RULE:** A client only ever gets tools for sources they have actually connected (`get_tools_for_client`). Never call a tool for an unconnected source.
- **RULE:** New integrations are added as new MCP tools + registry entries — never as inline API calls inside an agent node.
- The platform's long-term target is pre-built connectors for **200+ platforms via MCP**; the table above is the MVP subset.

---

## 9. RAG SYSTEM DESIGN

RAG makes agents context-aware: they retrieve relevant history and benchmarks before generating narratives, so outputs read like they come from someone who knows the client's business.

### Mechanics
- **Embeddings:** `OpenAIEmbeddings(model="text-embedding-3-small")` → 1536-dim vectors.
- **Storage:** `knowledge_embeddings` table; `embedding vector(1536)`; ivfflat cosine index (`lists = 100`).
- **Retrieval:** cosine similarity via `<=>`; query searches **client-specific + global** knowledge: `WHERE (client_id = $2 OR client_id IS NULL)`; default `top_k = 5`.

### The central embedding service (single source of truth)
`backend/app/services/embedding_service.py` is the **one and only** place embeddings are created, stored, and retrieved. It exposes:
- `store_embedding(content, client_id=None, metadata={})`
- `retrieve_similar(query, client_id=None, top_k=5)`

> **RULE:** Claude **MUST reuse the central embedding service** for all RAG. **No duplicate RAG implementations, no second embedding model, no parallel vector store.** Agents call `retrieve_similar` (e.g., the VoC `rag_context_node`) — they do not embed or query vectors directly.

### Integration pattern
- Add a `rag_context_node` **before** `narrative_generation_node`; store retrieved text on state (`rag_context`) and inject it into the narrative prompt.
- Retrieval respects tenancy: client rows + global rows only; never another client's rows.

### Approved knowledge sources (seed on day one)
- Past client insight reports (chunked ~500 tokens each).
- Industry benchmark data (churn rates, NPS benchmarks by industry).
- Common theme taxonomy (standardized theme descriptions).
- Competitor profiles (for CompSig context).
- Playbook entries (e.g., *"When churn risk > 20% and top theme is pricing, the recommended response is…"*).

> **RULE:** Only ingest approved source types into the knowledge base. New knowledge-source categories require approval.

---

## 10. API DESIGN STANDARDS

FastAPI is async-first. Structure routes for clarity and tenancy.

### Router organization
One router module per domain in `backend/app/routers/`, included in `app/main.py` with a prefix and tag:
- `auth.router` → prefix `/auth`, tag `Authentication`
- `insights.router` → prefix `/insights`, tag `VoC Insights`
- `signals.router` → prefix `/signals`, tag `Competitive Signals`
- `journeys.router` → prefix `/journeys`, tag `Journey Analytics`

### Route naming
- Resource-oriented, lowercase, hyphen/segment style. Examples present in the spec: `POST /insights/analyze`, `GET /insights/latest`, `GET /stream/insights`, plus the agent/ingest/report endpoints invoked by n8n (`/api/agents/voc/run`, `/api/agents/competitive-signal/run`, `/api/ingest/trigger`, `/api/reports/generate`, `/api/clients/active-list`, `/api/dashboard/summary`).
- Keep n8n-facing endpoints stable — workflows depend on these exact paths (§13).

### Authentication requirements
- Every data endpoint depends on `get_current_user` (JWT bearer via `OAuth2PasswordBearer(tokenUrl="/auth/token")`).
- JWT carries `sub` (user id) and `client_id`. Tokens are created with `create_access_token` and expire per `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Passwords hashed with bcrypt via `passlib`. JWT signed with `JWT_SECRET_KEY` / `JWT_ALGORITHM` (HS256).
- Auth middleware sets `app.current_client_id` for the request (§5).
- CORS: allow only `http://localhost:3000` (dev) and `https://app.dataautomated.io` (prod), `allow_credentials=True`.

### Error handling
- Use `HTTPException` with correct status codes (401 for invalid/missing token, etc.). Never leak another tenant's data or internal secrets in error bodies.
- Frontend treats any non-OK response as an error (`if (!res.ok) throw ...`).

### Background task rules (critical)
- **MUST NOT** block an HTTP request on an agent run. Agent endpoints enqueue work and return immediately:

```python
@router.post("/analyze")
async def trigger_voc_analysis(background_tasks: BackgroundTasks,
                               current_user = Depends(get_current_user)):
    background_tasks.add_task(run_voc_analysis, client_id=current_user.client_id)
    return {"status": "analysis_queued", "message": "You'll be notified when complete"}
```

- Read endpoints fetch the latest persisted result (e.g., `GET /insights/latest` → `fetch_latest_insight(client_id)`).
- Target: trigger endpoints respond `< 100ms`; see §16 benchmarks.

---

## 11. FRONTEND STANDARDS

Next.js **App Router (14+)**, TypeScript, Tailwind, Recharts. Clean, fast, data-dense. Every page authenticates against the FastAPI backend.

### Core principles
- **Server Components first.** Pages are async Server Components that fetch on the server (e.g., `DashboardPage` awaits `fetchDashboardSummary()`). Use Client Components only where interactivity/real-time requires it (`useEffect`, `EventSource`, toasts).
- **TypeScript strict mode** is required across the frontend.
- **All charts use Recharts.** No alternative charting libraries.
- Data access goes through the typed API client in `frontend/lib/api.ts` (`apiRequest`, `fetchDashboardSummary`, `fetchInsights`, `fetchSignals`, `triggerAnalysis`, ...). Every request sends `Authorization: Bearer <token>`.
- `NEXT_PUBLIC_API_URL` configures the backend base (`http://localhost:8000` in dev).
- Approved frontend deps: `recharts @radix-ui/react-dialog lucide-react date-fns`. Adding new UI dependencies requires justification.

### Page organization (the 5 core pages + supporting routes)
```
/dashboard        → Overview: all three services at a glance
/insights         → VoC: sentiment trends, theme breakdown, churn risk
/insights/[id]    → Single insight deep-dive with full narrative
/signals          → Competitive: signal feed, competitor profiles
/signals/[id]     → Single signal with strategic context
/journeys         → Journey: funnel visualization, friction heatmap
/journeys/[id]    → Single journey audit with recommendations
/reports          → Report history with download links
/settings         → Data source connections, alert preferences
```
These map to App Router segments under `frontend/app/`.

### Consistent UI patterns (keep stable)
- KPI row of `KPICard`s on the dashboard (Sentiment Score, Churn Risk, New Signals), with status/badge logic (e.g., churn `> 0.15` ⇒ `warning`).
- Per-service snapshot cards: `VoCSnapshotCard`, `CompSignalCard`, `JourneySnapshotCard`.
- Reusable card/grid layout (`grid grid-cols-3 gap-*`, `p-6 space-y-6`). Shared components live in `frontend/components/`.
- Real-time inserts prepend to lists and surface a toast ("New insight available").

---

## 12. REAL-TIME COMMUNICATION

The dashboard updates in real time as agents complete runs.

- **Transport:** **Server-Sent Events (SSE).** Backend exposes `GET /stream/insights` returning a `StreamingResponse(media_type="text/event-stream")`; frontend consumes via `EventSource`.
- **Event format:** SSE `data:` frames carrying JSON (`yield f"data: {json.dumps(new_insight)}\n\n"`).
- **Update handling:** on message, parse JSON, prepend to state, show a toast; always `eventSource.close()` on unmount.
- The reference loop polls the DB every 5s server-side and pushes when a new insight exists.

> **RULE — no polling-heavy solutions unless approved.** Client-side polling of REST endpoints to simulate real-time is **not** allowed; use SSE. (The 5s server-side check inside the SSE generator is the sanctioned mechanism. Replacing SSE with WebSockets or client polling requires approval.)

---

## 13. N8N AUTOMATION STANDARDS

n8n is the **cron/trigger layer** — it kicks off processes and handles delivery. **n8n does NOT do AI work.**

### Division of responsibility (strict)
- **n8n owns:** scheduling, looping over clients, calling FastAPI endpoints, conditional routing on results, and delivery (Slack + Resend email). Ingestion orchestration and report scheduling live here.
- **FastAPI + LangGraph own:** all business logic, data access, NLP/ML, narrative generation, and persistence.
- **MUST NOT:** implement analysis/insight logic inside n8n, or move agent orchestration logic out of FastAPI into n8n. n8n calls endpoints; it does not replace them.

### Official workflows (build these four)
1. **Daily Feedback Ingestion** — Schedule (every 6h) → `GET /api/clients/active-list` → loop clients → `POST /api/ingest/trigger` → wait → if `ingestion_count > 0` → `POST /api/agents/voc/run`.
2. **Competitive Signal Monitor** — Schedule (every 2h) → `GET /api/clients/with-competitive-monitoring` → loop → `POST /api/agents/competitive-signal/run` → if `signal.urgency = "critical"` → Slack `#client-alerts` + Resend email to client.
3. **Weekly Report Generation** — Schedule (Mon 9:00 AM) → `GET /api/clients/active-list` → loop → `POST /api/reports/generate` (`weekly_intelligence`, `last_7_days`) → wait for S3 URL → Resend weekly briefing with download link.
4. **Churn Alert (webhook)** — `POST /webhook/churn-alert` `{client_id, churn_risk_score, top_themes}` → if `> 0.25` URGENT Resend to client + Slack `#churn-monitor`; else if `> 0.15` standard early-warning Resend.

### Operational rules
- Build workflows in local n8n (`http://localhost:5678`), then **export to JSON in `n8n/workflows/`** and commit. Production runs the exported workflows.
- Keep webhook auth via `N8N_WEBHOOK_SECRET`. n8n basic auth is enabled.
- The endpoint paths above are a contract — do not rename them without updating workflows in the same change.

---

## 14. SECURITY REQUIREMENTS

Zero-trust, multi-tenant, auditable. Aligns with GDPR and SOC 2.

**MUST:**
- Authenticate every data endpoint with JWT (HS256, `JWT_SECRET_KEY`); hash passwords with bcrypt.
- Store all production secrets/API keys in **AWS Secrets Manager**; load config via `pydantic-settings`. Per-client integration credentials live in `data_sources.credentials`, **AES-256-encrypted at the app layer before storage**.
- Process client data in **isolated pipelines** (zero-trust). Persist **derived insights**, not raw customer source data — source data is processed in transit.
- Enforce tenant isolation via RLS + explicit `client_id` scoping on every query (§5, §6).
- Maintain a **complete audit trail** for all data access and AI agent actions.
- Keep LangSmith tracing on so every agent action is recorded.

**MUST NOT:**
- Commit `.env` files (add to `.gitignore` immediately). Never hardcode secrets or API keys.
- Log, return, or embed secrets, raw credentials, JWTs, or another tenant's data anywhere.
- Disable, weaken, or bypass RLS, auth, encryption, or the audit trail "to make something work."
- Store decrypted client credentials at rest or pass them to the frontend.
- Interpolate untrusted user input into SQL. (The only sanctioned interpolation is the server-derived `client_id` in the `SET app.current_client_id` statement — §5.)

---

## 15. DEPLOYMENT STANDARDS

Containerized, reproducible, auto-scaling. **One container per service.**

### Containers
- **Backend** `python:3.11-slim`; `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers …`.
- **Frontend** multi-stage `node:20-alpine`; Next.js standalone build; serves on `3000`.
- **DB (local/dev)** `pgvector/pgvector:pg16`.
- **n8n** `n8nio/n8n:latest`.
- Local dev via `docker-compose.yml`; production overrides in `docker-compose.prod.yml`. `docker-compose up` must start all services (Phase 1 done-criterion).

### AWS production architecture
```
Route 53 (DNS)
  → app.dataautomated.io → CloudFront → ECS Frontend
  → api.dataautomated.io → ALB → ECS Backend (2+ tasks)

ECS Cluster (Fargate):
  → Backend Service:  FastAPI  (2 tasks min, auto-scale to 10)
  → Frontend Service: Next.js  (2 tasks min)
  → n8n Service:      n8n      (1 task, persistent EFS storage)

RDS:            PostgreSQL 16 + pgvector (db.t4g.medium to start)
S3:             dataautomated-reports (PDF storage)
ECR:            container registry
Secrets Manager: all env vars + API keys (never hardcode)
CloudWatch:     logs from all containers
```

### Production expectations
- Backend auto-scales 2→10 tasks behind ALB; design every request and agent to be horizontally scalable and stateless (state lives in PostgreSQL/S3), consistent with the 500-client Prime Directive.
- n8n runs as a single task with persistent EFS — do not run multiple n8n tasks without rework.
- Deploy by building, tagging, and pushing images to ECR, then `aws ecs update-service … --force-new-deployment`.
- LangSmith tracing is active on all agent runs in production.

---

## 16. TESTING REQUIREMENTS

Testing is ongoing across the whole build (Day 1–35), not a final phase.

### Unit tests
- Test **every agent node in isolation** before wiring it into the graph (e.g., `tests/test_voc_agent.py::test_nlp_analysis_returns_sentiment` asserts sentiment sign per item). Backend tests use `pytest` + `pytest.mark.asyncio`.

### Agent tests
- Verify each node's input→output state transformation, plus end-to-end graph runs that persist to the DB. **Done criterion:** LangSmith shows successful traces for each agent.

### Integration tests
- Each MCP tool returns normalized data from its API. n8n workflows trigger and complete without error. Frontend can log in and see live data end-to-end.

### Performance targets (hard benchmarks)
| Endpoint / Process | Target |
|---|---|
| `GET /api/dashboard/summary` | < 300 ms |
| `POST /api/agents/voc/run` (trigger) | < 100 ms (async) |
| VoC agent full run (500 items) | < 60 s |
| CompSig agent full run | < 45 s |
| Page load (Next.js dashboard) | < 1.5 s |

### Coverage expectations
- **Every new feature must have a test** (the daily checklist gates this).
- QA exit bar: all tests passing, performance benchmarks met, no open bugs, and **LangSmith shows 0 failed runs in 48 hrs**.

### The Daily Operational Checklist (run before stopping work)
- [ ] **LangSmith:** all agent runs succeeding? any failed traces?
- [ ] **CloudWatch:** any error spikes in the last 24h?
- [ ] **n8n:** did all scheduled workflows execute on time?
- [ ] **Database:** is `raw_feedback` draining? (no buildup of `processed = FALSE`)
- [ ] **New feature:** does it have a test?

---

## 17. GIT WORKFLOW

### Branch strategy
- **Never push directly to `main`.** All work happens on feature branches.
- Merge to `main` **only via Pull Request**.

### Commit format (mandatory)
`type(scope): description`

Examples (verbatim from the Build Guide):
- `feat(voc-agent): add sentiment scoring pipeline`
- `feat(voc-agent): add sentiment pipeline`
- `fix(fastapi): resolve token expiry bug in auth middleware`
- `fix(auth): resolve jwt validation issue`
- `chore(docker): update postgres image to 16`

Use scopes that map to the architecture (`voc-agent`, `comp-signal-agent`, `journey-agent`, `fastapi`, `auth`, `db`, `frontend`, `n8n`, `rag`, `mcp`, `docker`, `aws`).

### PR requirements
- PRs are required for every merge to `main`.
- A PR must: follow the folder structure (§4), preserve multi-tenancy + RLS (§5, §6), include tests for new features (§16), and not introduce forbidden tech or rename schema (§3, §5).

### Feature development flow
1. Branch from `main`.
2. Implement within the approved structure; extend existing agents/tools rather than inventing new architecture.
3. Add/extend tests; run them.
4. Verify the daily checklist items relevant to the change.
5. Open a PR with a conventional title; merge only after review.

> **Never commit `.env` files.**

---

## 18. ENGINEERING DECISION FRAMEWORK

Before implementing **any** feature, Claude MUST verify all five gates:

1. **Does it match the Product Brief?** (Right service, right MVP scope, not a post-launch module.)
2. **Does it match the Build Guide?** (Right stack, structure, schema, build order, patterns.)
3. **Does it preserve multi-tenancy?** (RLS + `client_id` scoping intact; no cross-tenant access.)
4. **Does it preserve scalability?** (Holds at 100 and 500 clients; async; stateless; agents off the request path.)
5. **Does it preserve observability?** (LangSmith traces agent work; CloudWatch logs; audit trail intact.)

**If any answer is NO → STOP.** Do not implement. Surface the conflict, explain which gate fails and why, and **propose a compliant alternative**. Only proceed past a failed gate with explicit human approval, which should be recorded in the PR.

This framework also governs ambiguity: when the source documents are silent, choose the option that best satisfies gates 3–5 and the Prime Directive, and flag the assumption for review.

---

## 19. BUILD ORDER (MANDATORY)

Foundational phases come first. **Claude MUST NOT skip foundational phases** or build a later phase on an unbuilt earlier one. The canonical sequence (fused from both documents):

1. **Database** — schema + multi-tenant setup (PostgreSQL + pgvector + RLS). *(Day 2–4)*
2. **Backend** — FastAPI + auth + routes scaffolded + background tasks + LangGraph scaffolding. *(Day 4–8; Project setup Day 1–2 precedes it)*
3. **VoC Agent** — + NLP pipeline. *(within Day 8–18)*
4. **Competitive Signal Agent** — + data-mining workflows. *(Day 8–18)*
5. **Journey Agent** — + event processing. *(Day 8–18)*
6. **RAG** — embeddings + retrieval + agent context wiring. *(Day 16–20)*
7. **Frontend** — Next.js client portal, all 5 core pages + real-time. *(Day 18–28)*
8. **n8n** — the four automation workflows + Resend delivery. *(Day 14–18, runs in parallel but depends on backend endpoints)*
9. **Deployment** — Docker + AWS ECS/RDS/S3/ECR/CloudWatch. *(Day 25–32)*
10. **QA** — testing, performance benchmarks, polish. *(ongoing; exit Day 30–35)*

Supporting deliverables from the Product Brief build order also apply: alert & reporting system (Resend + PDF generation) and the new-client onboarding flow.

> The database is the foundation of everything — **do not write an API route before the schema + RLS exist.** Do not build the dashboard for a service whose agent does not yet persist results. MCP tools (Day 12–16) are built in parallel with the agents that consume them.

---

## 20. CLAUDE OPERATING INSTRUCTIONS

Explicit standing instructions for every Claude Code session on this repo:

- **Treat this CLAUDE.md as the authoritative project constitution.** It outranks habit, training priors, and "a nicer way to do it."
- **Never invent architecture.** Three agents, one stack, one structure, one schema. Extend; don't reinvent.
- **Prefer extension over replacement.** New capability = new node in an existing agent, new MCP tool, new service function, new App Router page — not a new framework or parallel system.
- **Never rename approved schema elements** (tables/columns) or change the UUID/`TIMESTAMPTZ`/JSONB/`vector(1536)` conventions without explicit approval. Migrations are additive and reviewed.
- **Never bypass RLS, tenant scoping, auth, encryption, or the audit trail.** Every tenant query is client-scoped; `app.current_client_id` is always set; agent DB connections still filter by `client_id`.
- **Never run an agent synchronously inside an HTTP request.** Use background tasks/dispatch; agents persist to the DB; the dashboard updates via SSE.
- **Reuse the central embedding service** for all RAG. No duplicate RAG, no second vector store, no alternate embedding model.
- **Keep AI work observable.** LangSmith env vars on; `@traceable` entry points; check LangSmith/CloudWatch/n8n daily.
- **Follow the approved folder structure** and the conventional commit + PR workflow. Never commit `.env`. Never push to `main` directly.
- **Use the approved stack only.** Introducing any technology not in §3 requires explicit approval; flag it, don't ship it.
- **Preserve scalability to 500+ clients** in every decision — async, stateless, horizontally scalable, agents off the request path.
- **Respect MVP scope.** Do not build post-launch roadmap modules (Revenue Intelligence Layer, AI Analyst Chat, Predictive Demand Forecasting, A/B Test Designer, Multi-Market) without approval.
- **Run the Engineering Decision Framework (§18) before every feature.** If any gate fails, STOP and propose a compliant alternative.
- **Surface known discrepancies** (e.g., Clerk vs. custom-JWT auth in §3) instead of silently picking; follow the documented default until a maintainer rules.
- **When unsure, ask.** A blocked decision that is genuinely the maintainer's to make gets raised — not guessed.

---

*DataAutomated.io — CLAUDE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Derived solely from the Product Brief v1.0 and the Technical Build Guide for Junex. These two documents are the single source of truth; this file is their enforceable engineering form.*
