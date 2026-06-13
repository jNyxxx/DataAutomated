# CLAUDE.md — DataAutomated.io Project Constitution

> **Status:** Authoritative. v1.0 | June 2026 | Confidential — Engineering Use Only.
> **Sources of truth:** `Product Brief v1.0` + `Technical Build Guide for Junex` (Brief = *what/why*; Guide = *how/order*; this file fuses both).
> **Authority:** The operating constitution for every Claude Code session here. A rule here is **final** unless a human maintainer approves a deviation in writing.

> **CURRENT MODE — LOCAL TESTING ONLY (June 2026):** No custom domain, no premium DNS, no SSL cert. The goal right now is to verify the full system works end-to-end locally (`docker-compose up`) before any production deployment. All verification targets `localhost`. Do not generate domain-dependent URLs, Stripe webhooks, or anything requiring `app.dataautomated.io` / `api.dataautomated.io` until this mode is explicitly lifted by the maintainer.

---

## HOW TO USE THIS FILE (READ FIRST, EVERY SESSION)

1. Single source of governance. Every decision below (naming, schema, architecture, stack, layout, build order) is **already decided** — don't relitigate it.
2. If a request conflicts with this file, **STOP** and surface the conflict (§18) — don't silently comply or deviate.
3. When the sources are silent, choose the option most consistent with the Prime Directive and flag the assumption.
4. The north-star metric, verbatim from the Build Guide, governs all judgment calls:

> **PRIME DIRECTIVE:** *"You are evaluated on one metric — deploying stable, scalable, automated systems that drive revenue. Every architectural decision you make should ask: 'Will this hold up at 100 clients? At 500?' If the answer is no, redesign it now."*

---

## 1. PROJECT OVERVIEW

An **AI-powered business intelligence platform**, delivered as **managed SaaS** to SaaS and eCommerce brands: clients connect data sources, the platform owns ingestion-to-insight (**no in-house data team required**). Differentiator: **interpretation, not just data** — every output explains what it means, why it matters, and what to do.

**Mission — close three intelligence gaps (one per service):** customers can't be heard clearly (feedback scattered across channels), competitor moves surface too late, and dashboards show drop-off but never *why*.

**Goals:** AI-native (core of every pipeline, not bolted on); first insight **within 14 days**; outcome-oriented; single-vendor; **scale to 500+ clients without redesign**.w3a

**Target customers:** Primary — SaaS, $500K–$15M ARR. Secondary — eCommerce, $2M–$25M GMV (Shopify/WooCommerce). Tertiary — mid-market enterprise, $15M–$100M.

**Pricing plans (drive `clients.plan` — §5):** **Insight Starter** (`insight_starter`, default) $1,497/mo — 1 service, monthly report, email alerts · **Intelligence Core** $2,997/mo — all 3 services, weekly briefings, Slack, real-time alerts · **Strategic Suite** $5,497/mo — all 3 + Win/Loss eaw Churn Early Warning, dedicated analyst · **Enterprise** Custom — custom infra, SLA, multi-team dashboards, co-pilot.

**The three intelligence services (one agent each — §7):**
1. **Voice-of-Customer (VoC) Platform** — turns scattered qualitative feedback into structured, prioritized, interpreted insight. **v1.1: Churn Early Warning System** (scores each cohort's emotional trajectory; fires a churn alert 2–4 weeks ahead of revenue impact).
2. **Competitive Signal Engine** — 24/7 scanning of thousands of sources (news, jobs, patents, funding, G2/Capterra, social, SEC filings) into interpreted, strategically-contextualized signals. **v1.1: Win/Loss Intelligence Integration** (CRM notes, transcripts, closed/lost cross-referenced against competitor moves).
3. **Behavioral Journey Intelligence Suite** — reconstructs real user journeys and shows *why* users drop off and what to change. **v1.1: Personalization Path Engine** (identifies behavioral archetype within first 3 sessions; recommends optimal path).

**MVP scope (build NOW) — three deliverables only:** (1) **Client Intelligence Dashboard** (Next.js, real-time); (2) **AI Intelligence Agents** (LangGraph + Python — three agents ingesting continuously, running NLP/ML, generating narratives, triggering alerts, observable in LangSmith); (3) **Data Integration Layer** (n8n workflows + MCP connectors).

**Out of scope for MVP (post-launch — DO NOT build without approval):** Revenue Intelligence Layer (v1.2), AI Analyst Chat Interface (v1.2), Predictive Demand Forecasting (v1.3), Automated A/B Test Designer (v1.3), Multi-Market Intelligence (v2.0).
> **RULE:** Never begin a post-launch module during MVP. If a request implies one, STOP and confirm scope.

---

## 2. NON-NEGOTIABLE ARCHITECTURAL PRINCIPLES

Hard rules. Violating any one is a defect even if tests pass.
- **MUST** design multi-tenant first: every client-scoped table carries `client_id`; every query is tenant-scoped.
- **MUST** treat client isolation as the highest-priority invariant; no feature crosses tenant boundaries.
- **MUST** enable and rely on PostgreSQL RLS for tenant data; app code is the second line of defense, never the only one.
- **MUST** set `app.current_client_id` at the start of every authenticated request before any tenant-table query.
- **MUST** be async-first (FastAPI + asyncpg); AI agent calls take 5–30s.
- **MUST NOT** run a LangGraph agent synchronously inside an HTTP request — agents run via background tasks; the request returns immediately.
- **MUST** make every AI workflow observable: LangSmith tracing on every agent run in every environment.
- **MUST NOT** let any feature bypass tenant boundaries, RLS, or the audit trail.
- **MUST** persist derived insights, not raw customer source data (Zero-Trust); source data is processed in transit.
- **MUST** encrypt all stored third-party credentials at the app layer (AES-256) before they touch the database.
- **MUST** design every component to hold at **100 and 500 clients**; if it won't, redesign now.
- **MUST NOT** hardcode secrets — all from environment / AWS Secrets Manager.
- **MUST** maintain a complete audit trail for all data access and AI agent actions.

---

## 3. APPROVED TECHNOLOGY STACK

The **official stack** — anything not listed is **forbidden unless a maintainer approves it** (no alternative frameworks, ORMs, vector stores, or cloud primitives on your own initiative).

### Backend & AI
| Technology | Role | Forbidden without approval |
|---|---|---|
| **Python 3.11** | Backend language | Other backend languages |
| **FastAPI** | REST API + AI orchestration (async-first; agent calls take 5–30s) | Flask, Django, Express |
| **asyncpg** | Async PostgreSQL driver | psycopg2 (sync), other drivers in hot paths |
| **PostgreSQL 16** | Primary store (multi-tenant + RLS) | MySQL, Mongo, DynamoDB as primary |
| **pgvector** | Vector storage / RAG (embeddings beside relational data) | Pinecone, Weaviate, Chroma, FAISS as primary |
| **LangGraph** | Stateful multi-step agent workflows | Raw LangChain chains, custom agent loops |
| **LangSmith** | Agent observability (full trace logging) | Ad-hoc logging as a replacement |
| **OpenAI** | `gpt-4o` (analysis/narrative), `text-embedding-3-small` (1536-dim) | Swapping providers without approval |

> NLP per Brief: transformer models (BERT/RoBERTa); MVP uses `gpt-4o` for NLP extraction + narrative per the Build Guide.

### Frontend
| Technology | Forbidden |
|---|---|
| **Next.js (App Router, 14+)** — Server-Component dashboard | Pages Router, CRA, Vite SPA |
| **TypeScript (strict)** | Plain JS |
| **Tailwind CSS** | Other CSS frameworks |
| **Recharts** (all charts) | Chart.js, D3 direct, Victory |
| **Resend** (report/email delivery) | SendGrid, SES-direct |

### Automation & Infrastructure
| Technology | Forbidden |
|---|---|
| **n8n** — trigger/cron layer (ingestion, alerts, reporting) | Celery/Airflow/custom cron for these jobs |
| **Docker** — one container per service | Non-containerized deploys |
| **AWS ECS (Fargate)** — orchestration, auto-scale, ALB | EKS/k8s, Lambda for services, other clouds |
| **AWS RDS (PostgreSQL 16 + pgvector)** | Self-managed DB |
| **AWS S3 / ECR / CloudWatch / Secrets Manager** (all env + keys) | Replacing as primary, or hardcoded/plaintext secrets |

### Auth — KNOWN DISCREPANCY (requires a maintainer ruling before building auth)
- **Product Brief:** **Clerk** for auth/user management.
- **Build Guide:** **custom JWT** (`python-jose` + `passlib[bcrypt]`), `users` table (`hashed_password`), `/auth/token` login, `get_current_user`.
- **Default until ruled otherwise:** follow the **Build Guide custom-JWT backend** (concrete spec), optionally fronted by Clerk for frontend sessions. **Do not delete the `users` table or JWT machinery to go Clerk-only without approval.** Flag in any auth PR.

---

## 4. REPOSITORY STRUCTURE

The **exact approved structure** (Build Guide). Reproduce precisely.

```
dataautomated/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Env config (pydantic-settings)
│   │   ├── database.py             # asyncpg connection pool
│   │   ├── models/                 # client.py, insight.py, signal.py, journey.py
│   │   ├── routers/                # auth.py, insights.py, signals.py, journeys.py
│   │   ├── agents/                 # voc_agent.py, comp_signal_agent.py, journey_agent.py
│   │   ├── tools/                  # MCP tools: zendesk_tool.py, typeform_tool.py, scraper_tool.py
│   │   └── services/               # nlp_service.py, embedding_service.py, report_service.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/                        # Next.js App Router: dashboard/ insights/ signals/ journeys/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   └── Dockerfile
├── n8n/workflows/                  # Exported n8n workflow JSON
├── docker-compose.yml              # Local dev
├── docker-compose.prod.yml         # Production overrides
└── .env.example
```

**Rules:**
- Follow this structure exactly; new files go in the matching existing folder. **MUST NOT** add new top-level folders without approval (`backend/tests/` permitted per §16; `app/tools/registry.py` + `base_tool.py` permitted — named in the Build Guide).
- Agents only in `app/agents/`, tools only in `app/tools/`, business logic only in `app/services/`, routes only in `app/routers/`; frontend routes under `frontend/app/`, shared UI in `components/`, data utils in `lib/`; n8n workflows version-controlled as exported JSON.

---

## 5. DATABASE GOVERNANCE

Get the database right before any API route. Strict.

### Conventions (mandatory)
- **PK:** every table `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` (needs `uuid-ossp`).
- **Timestamps:** always `TIMESTAMPTZ` — `created_at DEFAULT NOW()`, plus `ingested_at`, `occurred_at`, `detected_at`, `last_synced_at`, `period_start`/`period_end`.
- **Tenant key:** every client-scoped table has `client_id UUID REFERENCES clients(id) ON DELETE CASCADE`. (Exception: `knowledge_embeddings.client_id` is **nullable** — `NULL` = global — and references `clients(id)` without cascade.)
- **Naming:** `snake_case` tables/columns; enumerable string fields use `VARCHAR(n)` with documented allowed values (`urgency`, `sentiment_label`, `role`, `signal_type`, `friction_cause`).
- **JSONB:** for semi-structured/evolving data (`credentials`, `config`, `metadata`, `themes`, `properties`). Never put relational data or tenant identifiers in JSONB — `client_id` must be a first-class column for RLS.
- **FKs:** explicit `REFERENCES` + `ON DELETE CASCADE` for client-owned data; `raw_feedback.source_id` → `data_sources` has no cascade (preserve as written).
- **pgvector:** embeddings `vector(1536)` (matches `text-embedding-3-small`); index `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`; cosine distance `<=>` for retrieval.
- **Extensions:** `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

### Official Schema (canonical — all tables/columns/types as below; executable DDL in `backend/alembic/versions/0001_initial_schema.py`)
Every table has `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` + `created_at TIMESTAMPTZ DEFAULT NOW()`; client-scoped tables add `client_id UUID REFERENCES clients(id) ON DELETE CASCADE` (per Conventions; exceptions noted inline). Listed below: distinctive columns only.
- **`clients`** (tenant root — no `client_id`): `name VARCHAR(255) NOT NULL`, `email VARCHAR(255) UNIQUE NOT NULL`, `plan VARCHAR(50) DEFAULT 'insight_starter'`, `api_key VARCHAR(255) UNIQUE`, `is_active BOOLEAN DEFAULT TRUE`.
- **`users`**: `email VARCHAR(255) UNIQUE NOT NULL`, `hashed_password TEXT NOT NULL`, `role VARCHAR(50) DEFAULT 'viewer'` — `'admin' | 'analyst' | 'viewer'`.
- **`data_sources`**: `source_type VARCHAR(100) NOT NULL` ('zendesk','typeform','mixpanel', etc), `credentials JSONB` (AES-256 encrypted at app layer before storing), `config JSONB`, `last_synced_at TIMESTAMPTZ`, `is_active BOOLEAN DEFAULT TRUE`.
- **`raw_feedback`**: `source_id UUID REFERENCES data_sources(id)` (no cascade), `source_type VARCHAR(100)`, `external_id VARCHAR(255)`, `content TEXT NOT NULL`, `metadata JSONB`, `ingested_at TIMESTAMPTZ DEFAULT NOW()`, `processed BOOLEAN DEFAULT FALSE`.
- **`feedback_insights`**: `feedback_ids UUID[]`, `sentiment_score FLOAT` (-1.0..1.0), `sentiment_label VARCHAR(50)` — `'positive' | 'negative' | 'neutral' | 'mixed'`, `urgency_score FLOAT` (0.0..1.0), `themes JSONB`, `narrative TEXT`, `churn_risk FLOAT` (0.0..1.0), `period_start`/`period_end TIMESTAMPTZ`.
- **`competitive_signals`**: `competitor_name VARCHAR(255)`, `signal_type VARCHAR(100)` ('pricing','product_launch','hiring',...), `signal_source VARCHAR(255)`, `raw_content TEXT`, `strategic_context TEXT`, `urgency VARCHAR(50)` — `'critical' | 'high' | 'medium' | 'low'`, `detected_at TIMESTAMPTZ DEFAULT NOW()`, `is_read BOOLEAN DEFAULT FALSE`.
- **`journey_events`**: `session_id VARCHAR(255)`, `user_id VARCHAR(255)`, `event_type VARCHAR(255)` ('page_view','click','form_start','abandon',...), `properties JSONB`, `occurred_at TIMESTAMPTZ`, `ingested_at TIMESTAMPTZ DEFAULT NOW()`.
- **`journey_insights`**: `funnel_step VARCHAR(255)`, `drop_off_rate FLOAT`, `friction_score FLOAT`, `friction_cause VARCHAR(100)` — `'ux_friction' | 'messaging' | 'expectation'`, `recommendation TEXT`, `projected_lift FLOAT`.
- **`knowledge_embeddings`**: `client_id UUID REFERENCES clients(id)` — **nullable, no cascade; `NULL` = global knowledge**, `content TEXT NOT NULL`, `embedding vector(1536)`, `metadata JSONB`. Index: `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`.
- **`reports`**: `report_type VARCHAR(100)` ('weekly_voc','competitive_brief','journey',...), `s3_key VARCHAR(500)`, `period_start`/`period_end TIMESTAMPTZ`.

### Client-isolation tables
Tenant-scoped via `client_id`, must be tenant-filtered on every access: `users`, `data_sources`, `raw_feedback`, `feedback_insights`, `competitive_signals`, `journey_events`, `journey_insights`, `reports`, and client-specific `knowledge_embeddings` (`NULL` rows are intentionally global).

### RLS is mandatory
```sql
ALTER TABLE raw_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_insights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_insights    ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_isolation ON raw_feedback
    USING (client_id = current_setting('app.current_client_id')::UUID);
-- Repeat the policy for every RLS-enabled table.
```
- **RULE:** Apply `client_isolation` to **every** RLS-enabled table.
- **RECOMMENDED (flag for approval):** extend RLS to the remaining tenant tables (`data_sources`, `reports`, client-specific `knowledge_embeddings`) for defense-in-depth. Never remove or weaken an existing policy.

### Enforcing `current_client_id`
At the start of **every authenticated request**, before any tenant query, the FastAPI auth middleware sets the session var:
```python
await conn.execute(f"SET app.current_client_id = '{current_user.client_id}'")
```
- **RULE:** No tenant query runs without `app.current_client_id` set for that connection/transaction.
- **SECURITY NOTE (flag, don't silently "fix" against spec):** the f-string is acceptable only because `client_id` is a server-derived UUID from the validated JWT (never user input). Prefer `SET LOCAL` in a transaction and/or `set_config(...)` parameterization when refactoring; never interpolate untrusted input.

### Immutable schema rule
> **NEVER rename approved tables/columns, change their types, drop columns, or alter the UUID/timestamp/JSONB/pgvector conventions without explicit human approval.** Only additive, backward-compatible changes (new nullable columns, new conventional tables, new indexes) are permitted without a ruling. All schema changes ship as reviewed migrations.

---

## 6. MULTI-TENANCY RULES

Client isolation is the most important invariant. No exceptions.
- **MUST:** scope every tenant-table query to the current client — via RLS *and* explicit `WHERE client_id = $1` (belt and suspenders); the Build Guide agents already do this, preserve it.
- **MUST:** every service, agent, tool, and background task operates under an explicit `client_id` — passed in or derived from the authenticated request, never inferred or defaulted.
- **MUST NOT:** read, join, or aggregate across multiple clients in a tenant-facing query.
- **MUST NOT:** expose another client's `id`, `api_key`, data, or insights in any response, log, alert, report, or error.
- **MUST:** MCP tools load only the connected sources/credentials for the given `client_id`.
- **MUST:** background/agent DB connections set `app.current_client_id` **or** filter by `client_id` explicitly — RLS only guards connections where the session var is set, so a raw `asyncpg.connect` in an agent must still filter by `client_id` (as `fetch_feedback_node` does).

**Always** scope: `... FROM raw_feedback WHERE client_id = $1 ...`. **Forbidden:** any tenant query without a `client_id` filter (leaks across tenants) and cross-tenant aggregation (`... AVG(sentiment_score) ... GROUP BY client_id`).

---

## 7. AGENT ARCHITECTURE

**Exactly three** agents, one per service. Each is a **LangGraph `StateGraph`** (nodes = steps, edges = transitions, typed state between nodes), `@traceable` in LangSmith, runs **asynchronously** (never inside an HTTP request), and persists results to PostgreSQL.

> **RULE:** Extend these three agents. **MUST NOT** create competing frameworks, parallel orchestration, or a fourth agent without approval. New capability = a new node or MCP tool in an existing agent — not a new architecture.

**Shared contract:** state is a `TypedDict` carrying `client_id` + working fields; graph uses explicit `add_node`/`add_edge`, `set_entry_point`, `END`, `.compile()`; the public entry function is `@traceable(name=...)`; LLM = `ChatOpenAI(model="gpt-4o", temperature=0)`; NLP batching = 20 items/batch; VoC fetch limit = 500; the final node persists to the correct insights table and marks source rows processed.

### 7.1 VoC Agent — `backend/app/agents/voc_agent.py`
- **Inputs:** `raw_feedback` where `processed = FALSE` (latest 500); optional RAG context (§9).
- **Outputs:** a `feedback_insights` row; `raw_feedback.processed = TRUE`; a churn alert webhook to n8n when `alert_required`.
- **State (`VoCState`):** `client_id`, `raw_feedback`, `preprocessed`, `sentiment_results`, `theme_clusters`, `churn_risk_score`, `narrative`, `alert_required` (+ `rag_context` once RAG added).
- **Nodes:** `fetch_feedback` → `nlp_analysis` → `theme_clustering` → (`rag_context`) → `narrative_generation` → `check_alert` → `store_results` → `END`.
- **Rules:** `alert_required = churn_risk_score > 0.15` (n8n then escalates: `>0.25` URGENT, `>0.15` standard early warning — §13). NLP node returns per-item JSON: `sentiment_score (-1.0..1.0)`, `urgency_score (0.0..1.0)`, `primary_theme`, `intent ('complaint'|'request'|'praise'|'question')`, `churn_signal (bool)`. The RAG node, when present, is inserted **before** `narrative_generation` and injects retrieved context.

### 7.2 Competitive Signal Agent — `backend/app/agents/comp_signal_agent.py`
- **Inputs:** client competitor config; external signals via MCP tools (`scrape_g2_reviews`, `fetch_linkedin_jobs`, `search_news`, etc.).
- **Outputs:** `competitive_signals` rows; critical signals trigger real-time n8n alerts.
- **State (`CompSignalState`):** `client_id`, `competitors`, `raw_signals`, `classified_signals`, `strategic_context`, `critical_signals`.
- **Nodes:** `fetch_competitors` → `mine_signals` → `classify_signals` → `generate_strategic_context` → `flag_critical` → `store` → `END`.

### 7.3 Behavioral Journey Agent — `backend/app/agents/journey_agent.py`
- **Inputs:** `journey_events`; MCP tools (`fetch_mixpanel_events`, `fetch_segment_events`, `fetch_shopify_events`).
- **Outputs:** `journey_insights` rows; `friction_cause ∈ {ux_friction, messaging, expectation}`.
- **State (`JourneyState`):** `client_id`, `journey_events`, `funnel_steps`, `drop_off_analysis`, `friction_diagnosis`, `recommendations`, `narrative`.
- **Nodes:** `fetch_events` → `define_funnels` → `calculate_dropoffs` → `diagnose_friction` → `generate_recommendations` → `store` → `END`.

---

## 8. MCP TOOL SYSTEM

MCP is how agents reach external sources without bespoke wrappers. **Define a tool once; call it from any agent.** All external integrations **must** be MCP-compatible tools.

### Requirements
- Each tool lives in `backend/app/tools/`, subclasses `langchain.tools.BaseTool` (see `base_tool.py`); declares a Pydantic `args_schema` (`Field(description=...)` per arg) with `client_id` always an explicit argument; has a stable `name` + clear `description`.
- Fetches **encrypted per-client credentials** from `data_sources.credentials`, decrypts at the app layer, then calls the API — credentials never live in code or env for per-client integrations.
- Returns **normalized** data (e.g. `[{"id","content","metadata":{...}}]`), not raw vendor payloads.

### Naming & registry
`fetch_*` (API pulls), `scrape_*` (public-page scraping), `search_*` (query discovery); `snake_case`, matching registry keys/source types. All tools register in `backend/app/tools/registry.py` so agents resolve them per client:
```python
TOOL_REGISTRY = {
    "zendesk": ZendeskFeedbackTool(), "typeform": TypeformResponseTool(),
    "intercom": IntercomTool(), "g2": G2ReviewScraper(), "news": NewsSignalTool(),
    "mixpanel": MixpanelEventsTool(), "segment": SegmentEventsTool(),
}
def get_tools_for_client(client_id: str) -> list:
    """Returns only the tools for data sources this client has connected."""
    connected_sources = get_client_data_sources(client_id)
    return [TOOL_REGISTRY[src] for src in connected_sources if src in TOOL_REGISTRY]
```

### Official MVP tool set
| Tool | Source | Used by |
|---|---|---|
| `fetch_zendesk_feedback` | Zendesk API | VoC |
| `fetch_typeform_responses` | Typeform API | VoC |
| `fetch_intercom_conversations` | Intercom API | VoC |
| `scrape_g2_reviews` | G2 public pages | CompSig |
| `scrape_capterra_reviews` | Capterra public pages | CompSig |
| `search_news_signals` | News API / SerpAPI | CompSig |
| `fetch_linkedin_jobs` | LinkedIn scraper | CompSig |
| `fetch_mixpanel_events` | Mixpanel API | Journey |
| `fetch_segment_events` | Segment API | Journey |
| `fetch_shopify_events` | Shopify API | Journey |

- **RULE:** A client gets tools only for sources it has actually connected (`get_tools_for_client`); never call a tool for an unconnected source.
- **RULE:** New integrations = new MCP tool + registry entry, never inline API calls inside an agent node.
- Target: **200+ connectors via MCP** long-term; the table is the MVP subset.

---

## 9. RAG SYSTEM DESIGN

Agents retrieve relevant history/benchmarks before generating narratives — outputs read like they know the client's business.

### Mechanics
- **Embeddings:** `OpenAIEmbeddings(model="text-embedding-3-small")` → 1536-dim.
- **Storage:** `knowledge_embeddings`; `embedding vector(1536)`; ivfflat cosine index (`lists = 100`).
- **Retrieval:** cosine via `<=>`; query searches **client-specific + global**: `WHERE (client_id = $2 OR client_id IS NULL)`; default `top_k = 5`.

### Central embedding service (single source of truth)
`backend/app/services/embedding_service.py` is the **one and only** place embeddings are created/stored/retrieved:
- `store_embedding(content, client_id=None, metadata={})`
- `retrieve_similar(query, client_id=None, top_k=5)`
> **RULE:** Reuse the central embedding service for all RAG. **No duplicate RAG, no second embedding model, no parallel vector store.** Agents call `retrieve_similar` (e.g. the VoC `rag_context_node`); they do not embed or query vectors directly.

### Integration & sources
- Add a `rag_context_node` **before** `narrative_generation_node`; store retrieved text on state (`rag_context`) and inject into the narrative prompt. Retrieval respects tenancy: client + global rows only; never another client's rows.
- **Approved seed sources:** past client insight reports (~500-token chunks), industry benchmarks (churn/NPS), theme taxonomy, competitor profiles, playbook entries. **Only ingest approved source types; new categories require approval.**

---

## 10. API DESIGN STANDARDS

FastAPI, async-first.

### Routers (one per domain in `backend/app/routers/`, included in `main.py` with prefix + tag)
- `auth.router` → `/auth`, tag `Authentication`
- `insights.router` → `/insights`, tag `VoC Insights`
- `signals.router` → `/signals`, tag `Competitive Signals`
- `journeys.router` → `/journeys`, tag `Journey Analytics`

### Routes
Resource-oriented, lowercase. Examples: `POST /insights/analyze`, `GET /insights/latest`, `GET /stream/insights`, plus n8n-facing `/api/agents/voc/run`, `/api/agents/competitive-signal/run`, `/api/ingest/trigger`, `/api/reports/generate`, `/api/clients/active-list`, `/api/dashboard/summary`. **Keep n8n-facing paths stable** — workflows depend on these exact paths (§13).

### Auth
- Every data endpoint depends on `get_current_user` (JWT bearer via `OAuth2PasswordBearer(tokenUrl="/auth/token")`).
- JWT carries `sub` (user id) + `client_id`; created with `create_access_token`, expires per `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Passwords bcrypt via `passlib`; JWT signed with `JWT_SECRET_KEY`/`JWT_ALGORITHM` (HS256).
- Auth middleware sets `app.current_client_id` (§5). CORS: allow only `http://localhost:3000` (dev) and `https://app.dataautomated.io` (prod), `allow_credentials=True`.

### Errors & background tasks
- Use `HTTPException` with correct codes (401 for invalid/missing token); never leak another tenant's data or secrets. Frontend treats any non-OK response as an error.
- **MUST NOT** block an HTTP request on an agent run — endpoints enqueue via `background_tasks.add_task(run_voc_analysis, client_id=current_user.client_id)` and return immediately (e.g. `{"status": "analysis_queued"}`).
- Read endpoints fetch the latest persisted result (e.g. `GET /insights/latest` → `fetch_latest_insight(client_id)`). Target: trigger endpoints respond `< 100ms` (§16).

---

## 11. FRONTEND STANDARDS

Next.js **App Router (14+)**, TypeScript strict, Tailwind, Recharts. Clean, fast, data-dense; every page authenticates against the FastAPI backend.

### Principles
- **Server Components first** — pages fetch on the server (e.g. `DashboardPage` awaits `fetchDashboardSummary()`); Client Components only for interactivity/real-time (`useEffect`, `EventSource`, toasts).
- **TypeScript strict** required. **All charts use Recharts** (no alternatives).
- Data access goes through the typed client `frontend/lib/api.ts` (`apiRequest`, `fetchDashboardSummary`, `fetchInsights`, `fetchSignals`, `triggerAnalysis`, ...); every request sends `Authorization: Bearer <token>`; `NEXT_PUBLIC_API_URL` sets the backend base (`http://localhost:8000` dev).
- Approved deps: `recharts @radix-ui/react-dialog lucide-react date-fns`. New UI deps need justification.

### Pages (5 core + supporting), App Router segments under `frontend/app/`
`/dashboard` (all three at a glance), `/insights` + `/insights/[id]` (sentiment, themes, churn), `/signals` + `/signals/[id]` (feed, competitor profiles, strategic context), `/journeys` + `/journeys/[id]` (funnel, friction heatmap, recommendations), `/reports`, `/settings`.

### UI patterns (keep stable)
- Dashboard: KPI row of `KPICard`s (Sentiment Score, Churn Risk, New Signals; churn `> 0.15` ⇒ `warning`) + snapshot cards `VoCSnapshotCard`/`CompSignalCard`/`JourneySnapshotCard`; shared components in `frontend/components/`.
- Real-time inserts prepend to lists and surface a toast ("New insight available").

---

## 12. REAL-TIME COMMUNICATION

- **Transport: Server-Sent Events (SSE).** Backend exposes `GET /stream/insights` → `StreamingResponse(media_type="text/event-stream")`; frontend uses `EventSource`.
- **Format:** SSE `data:` frames of JSON (`yield f"data: {json.dumps(new_insight)}\n\n"`).
- **Handling:** parse JSON, prepend to state, show a toast; `eventSource.close()` on unmount. The reference loop polls the DB every 5s server-side and pushes when a new insight exists.
> **RULE — no polling-heavy solutions unless approved.** Client-side polling of REST to simulate real-time is **not** allowed; use SSE. (The 5s server-side check inside the SSE generator is the sanctioned mechanism. Replacing SSE with WebSockets or client polling requires approval.)

---

## 13. N8N AUTOMATION STANDARDS

n8n is the **cron/trigger layer** — it kicks off processes and handles delivery. **n8n does NOT do AI work.**

### Division of responsibility (strict)
- **n8n owns:** scheduling, looping over clients, calling FastAPI endpoints, conditional routing, delivery (Slack + Resend).
- **FastAPI + LangGraph own:** all business logic, data access, NLP/ML, narrative generation, persistence.
- **MUST NOT:** implement analysis/insight logic in n8n or move agent orchestration into it — n8n calls endpoints, it doesn't replace them.

### The four workflows
1. **Daily Feedback Ingestion** — every 6h → `GET /api/clients/active-list` → loop → `POST /api/ingest/trigger` → if `ingestion_count > 0` → `POST /api/agents/voc/run`.
2. **Competitive Signal Monitor** — every 2h → `GET /api/clients/with-competitive-monitoring` → loop → `POST /api/agents/competitive-signal/run` → if `signal.urgency = "critical"` → Slack `#client-alerts` + Resend to client.
3. **Weekly Report Generation** — Mon 9:00 AM → `GET /api/clients/active-list` → loop → `POST /api/reports/generate` (`weekly_intelligence`, `last_7_days`) → S3 URL → Resend weekly briefing with download link.
4. **Churn Alert (webhook)** — `POST /webhook/churn-alert` `{client_id, churn_risk_score, top_themes}` → if `> 0.25` URGENT Resend to client + Slack `#churn-monitor`; else if `> 0.15` standard early-warning Resend.

### Operational rules
- Build in local n8n (`http://localhost:5678`), **export to JSON in `n8n/workflows/`** and commit; production runs the exports. Webhook auth via `N8N_WEBHOOK_SECRET`; n8n basic auth enabled.
- The endpoint paths above are a contract — don't rename without updating workflows in the same change.

---

## 14. SECURITY REQUIREMENTS

Zero-trust, multi-tenant, auditable (GDPR + SOC 2 aligned).

**MUST:**
- Authenticate every data endpoint with JWT (HS256, `JWT_SECRET_KEY`); hash passwords with bcrypt.
- Store production secrets/keys in **AWS Secrets Manager** (config via `pydantic-settings`); per-client credentials live in `data_sources.credentials`, **AES-256-encrypted at the app layer before storage**.
- Process client data in **isolated pipelines** (zero-trust); persist **derived insights, not raw source data** (processed in transit).
- Enforce tenant isolation via RLS + explicit `client_id` scoping on every query (§5, §6).
- Maintain a **complete audit trail** for all data access + AI agent actions; keep LangSmith tracing on.

**MUST NOT:**
- Commit `.env` (add to `.gitignore` immediately); hardcode secrets/keys.
- Log, return, or embed secrets, raw credentials, JWTs, or another tenant's data.
- Disable, weaken, or bypass RLS, auth, encryption, or the audit trail "to make something work."
- Store decrypted client credentials at rest or pass them to the frontend.
- Interpolate untrusted user input into SQL. (Only sanctioned interpolation: the server-derived `client_id` in `SET app.current_client_id` — §5.)

---

## 15. DEPLOYMENT STANDARDS

Containerized, reproducible, auto-scaling. **One container per service.**

### Containers
- **Backend** `python:3.11-slim`; `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers …`.
- **Frontend** multi-stage `node:20-alpine`; Next.js standalone build; serves `3000`.
- **DB (local/dev)** `pgvector/pgvector:pg16`. **n8n** `n8nio/n8n:latest`.
- Local dev via `docker-compose.yml`; prod overrides in `docker-compose.prod.yml`. `docker-compose up` must start all services (Phase 1 done-criterion).

### AWS production
```
Route 53 → app.dataautomated.io → CloudFront → ECS Frontend
         → api.dataautomated.io → ALB → ECS Backend (2+ tasks)
ECS (Fargate): Backend FastAPI (2 min, auto-scale to 10) · Frontend Next.js (2 min) · n8n (1 task, persistent EFS)
RDS: PostgreSQL 16 + pgvector (db.t4g.medium) · S3: dataautomated-reports · ECR · Secrets Manager (all env + keys) · CloudWatch
```

### Expectations
- Backend auto-scales 2→10 behind ALB; every request + agent is **stateless** (state in PostgreSQL/S3), per the 500-client Prime Directive.
- n8n is a single task with persistent EFS — don't run multiple n8n tasks without rework.
- Deploy: push images to ECR, then `aws ecs update-service … --force-new-deployment`. LangSmith tracing active in production.

---

## 16. TESTING REQUIREMENTS

Testing is ongoing (Day 1–35), not a final phase.
- **Unit:** test **every agent node in isolation** before wiring it in (e.g. `test_voc_agent.py::test_nlp_analysis_returns_sentiment`). Backend uses `pytest` + `pytest.mark.asyncio`.
- **Agent:** verify each node's input→output transformation + end-to-end graph runs that persist to DB. **Done:** LangSmith shows successful traces per agent.
- **Integration:** each MCP tool returns normalized data; n8n workflows trigger/complete without error; frontend logs in and sees live data end-to-end.

### Performance targets (hard benchmarks)
| Endpoint / Process | Target |
|---|---|
| `GET /api/dashboard/summary` | < 300 ms |
| `POST /api/agents/voc/run` (trigger) | < 100 ms (async) |
| VoC agent full run (500 items) | < 60 s |
| CompSig agent full run | < 45 s |
| Page load (Next.js dashboard) | < 1.5 s |

- **Coverage:** every new feature must have a test (daily checklist gates this). QA exit bar: all tests passing, benchmarks met, no open bugs, **LangSmith shows 0 failed runs in 48 hrs**.

### Daily Operational Checklist (before stopping work)
- [ ] **LangSmith:** all agent runs succeeding? any failed traces?
- [ ] **CloudWatch:** error spikes in last 24h?
- [ ] **n8n:** all scheduled workflows ran on time?
- [ ] **Database:** is `raw_feedback` draining (no buildup of `processed = FALSE`)?
- [ ] **New feature:** does it have a test?

---

## 17. GIT WORKFLOW

- **Never push directly to `main`.** All work on feature branches; merge to `main` **only via PR**.
- **Commit format (mandatory):** `type(scope): description` (e.g. `feat(voc-agent): add sentiment scoring`, `fix(auth): resolve jwt validation`). Scopes map to architecture: `voc-agent`, `comp-signal-agent`, `journey-agent`, `fastapi`, `auth`, `db`, `frontend`, `n8n`, `rag`, `mcp`, `docker`, `aws`.
- **PR:** follow §4 structure, preserve multi-tenancy + RLS (§5, §6), include tests for new features (§16), no forbidden tech, no schema rename (§3, §5).
- **Flow:** branch from `main` → implement within the structure → add/run tests → verify relevant daily-checklist items → open PR (conventional title) → merge after review.
> Never commit `.env`.

---

## 18. ENGINEERING DECISION FRAMEWORK

Before implementing **any** feature, verify all five gates:
1. **Matches the Product Brief?** (Right service, MVP scope, not a post-launch module.)
2. **Matches the Build Guide?** (Right stack, structure, schema, build order, patterns.)
3. **Preserves multi-tenancy?** (RLS + `client_id` scoping intact; no cross-tenant access.)
4. **Preserves scalability?** (Holds at 100 and 500 clients; async; stateless; agents off the request path.)
5. **Preserves observability?** (LangSmith traces agent work; CloudWatch logs; audit trail intact.)

**If any answer is NO → STOP.** Don't implement; surface the conflict, name the failing gate, and **propose a compliant alternative**. Proceed past a failed gate only with explicit human approval recorded in the PR. When the sources are silent, choose the option best satisfying gates 3–5 + the Prime Directive, and flag the assumption.

---

## 19. BUILD ORDER (MANDATORY)

Foundational phases first. **Never skip foundational phases** or build a later phase on an unbuilt earlier one.
1. **Database** — schema + multi-tenant (PostgreSQL + pgvector + RLS).
2. **Backend** — FastAPI + auth + routes scaffolded + background tasks + LangGraph scaffolding (project setup precedes).
3. **VoC Agent** + NLP pipeline.
4. **Competitive Signal Agent** + data-mining workflows.
5. **Journey Agent** + event processing.
6. **RAG** — embeddings + retrieval + agent context wiring.
7. **Frontend** — Next.js portal, all 5 core pages + real-time.
8. **n8n** — the four automation workflows + Resend delivery (depends on backend endpoints).
9. **Deployment** — Docker + AWS ECS/RDS/S3/ECR/CloudWatch.
10. **QA** — testing, performance benchmarks, polish (ongoing).

Also (Product Brief): alert & reporting (Resend + PDF) and new-client onboarding flow.
> The database is the foundation — **no API route before schema + RLS exist.** Don't build a dashboard for a service whose agent doesn't yet persist results. MCP tools build in parallel with the agents that consume them.

---

## 20. CLAUDE OPERATING INSTRUCTIONS

Authoritative — outranks habit and "a nicer way to do it." Each rule is detailed in its cited section:
- **Extend, don't reinvent** — three agents, one stack/structure/schema; new capability = new node / MCP tool / service / page (§7).
- **Never rename approved schema** or alter UUID/`TIMESTAMPTZ`/JSONB/`vector(1536)` conventions without approval; migrations additive + reviewed (§5).
- **Never bypass RLS, tenant scoping, auth, encryption, or the audit trail** (§6, §14); `app.current_client_id` always set; agents still filter by `client_id`.
- **Agents run async, off the request path** — background tasks, persist to DB, dashboard via SSE (§2, §10, §12).
- **Reuse the central embedding service** for all RAG — no duplicate RAG / vector store / embedding model (§9).
- **Keep AI work observable** — LangSmith on, `@traceable` entry points, run the daily checklist (§16).
- **Approved stack only** (§3); **follow the structure** + conventional commit/PR flow, never commit `.env`, never push to `main` (§4, §17).
- **Scale to 500+ clients** — async, stateless, horizontally scalable; **MVP scope only**, no post-launch modules without approval (§1).
- **Run the §18 gates before every feature**; surface known discrepancies (e.g. Clerk vs custom-JWT, §3) instead of guessing; **when unsure, ask.**

---

*DataAutomated.io — CLAUDE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Derived solely from the Product Brief v1.0 and the Technical Build Guide for Junex (the single source of truth); this file is their enforceable engineering form.*
