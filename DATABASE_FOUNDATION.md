# DATABASE_FOUNDATION.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The data foundation blueprint — the canonical schema, the conventions that bind it, how vectors live beside relational data, and how schema change is governed. The database is the foundation of everything; **no API route is written before the schema + RLS exist** (CLAUDE §5, §19).
> **Governing sources:** `CLAUDE.md` §5 (database governance — canonical schema), §2 (architectural principles), §3 (stack: PostgreSQL 16, pgvector, asyncpg), §14 (security/retention); `ARCHITECTURE_DECISION_RECORDS.md` ADR-003 (unified store), ADR-004 (RLS), ADR-010 (vectors); `MASTER_ROADMAP.md` DR-01…05, AUD-02 (DSN), AUD-03 (ORM/raw), AUD-04 (migrations), RISK-08 (schema drift), RISK-09 (pgvector ceiling), SR-06 (retention).
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (RLS detail) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (pool/DSN) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) (persistence targets) · [RAG_ARCHITECTURE](RAG_ARCHITECTURE.md) (embeddings) · [IMPLEMENTATION_SEQUENCE](IMPLEMENTATION_SEQUENCE.md) (P2).
> **Scope boundary:** This document **does not contain a migration** and does not create the database. It is the design the P2 migrations will implement. RLS policy *operation* (helper, isolation test, lifecycle) lives in MULTI_TENANT_SECURITY; this document fixes the schema and the storage conventions.

---

## 1. Foundational principles (ADR-003)

One PostgreSQL 16 instance with the pgvector extension is **both** the relational store and the vector store (ADR-003; CLAUDE §3). The single-store choice is deliberate: embeddings inherit tenant isolation (RLS + `client_id`) for free, an insight and its embedding are written under one transaction, and there is one backup/restore, one connection-pool story, one place to reason about performance — the properties that matter for holding the line to 500 clients (ADR-003 rationale; Prime Directive). The accepted trade-off is a pgvector recall/scale ceiling vs a dedicated ANN engine (RISK-09), tuned later, not designed around now.

---

## 2. Mandatory conventions (CLAUDE §5)

Every table and column obeys these. They are part of the immutable contract (CLAUDE §5, §20).

| Convention | Rule | Source |
|---|---|---|
| **Primary keys** | `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` (needs `uuid-ossp`) | CLAUDE §5; DR-02 |
| **Timestamps** | Always `TIMESTAMPTZ`. Creation = `created_at TIMESTAMPTZ DEFAULT NOW()`. Others: `ingested_at`, `occurred_at`, `detected_at`, `last_synced_at`, `period_start`, `period_end` | CLAUDE §5; DR-02 |
| **Tenant key** | Every client-scoped table: `client_id UUID REFERENCES clients(id) ON DELETE CASCADE`. **Exception:** `knowledge_embeddings.client_id` is **nullable** (NULL = global) and references `clients(id)` *without* cascade | CLAUDE §5; ADR-004 |
| **Naming** | `snake_case` columns; enumerable string fields use `VARCHAR(n)` with documented allowed values | CLAUDE §5 |
| **JSONB** | For semi-structured/evolving data (`credentials`, `config`, `metadata`, `themes`, `properties`). **Never** smuggle relational data or tenant identifiers into JSONB — `client_id` must be a first-class column for RLS | CLAUDE §5; ADR-004 |
| **Foreign keys** | Explicit `REFERENCES` with `ON DELETE CASCADE` for client-owned data. `raw_feedback.source_id → data_sources(id)` has **no cascade** declared — preserve as written | CLAUDE §5 |
| **pgvector** | `vector(1536)` (matches `text-embedding-3-small`); ivfflat `(embedding vector_cosine_ops) WITH (lists = 100)`; cosine distance `<=>` for retrieval | CLAUDE §5; ADR-010; DR-03 |
| **Extensions** | `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` | CLAUDE §5 |

---

## 3. Canonical schema (reproduced exactly from CLAUDE §5 — DR-01)

> **Immutable.** Reproduced verbatim. Never rename tables/columns, change types, drop columns, or alter the UUID/timestamp/JSONB/pgvector conventions without explicit human approval. Additive, backward-compatible changes (new nullable columns, new tables following these conventions, new indexes) are the only changes permitted without a ruling, and ship as reviewed migrations (CLAUDE §5 "Immutable schema rule", §20).

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

---

## 4. Per-table notes & enumerations

| Table | Tenant-scoped? | Persistence owner | Notes / allowed-value sets |
|---|---|---|---|
| `clients` | root (not scoped) | onboarding | `plan ∈ {insight_starter (default), intelligence_core, strategic_suite, enterprise}` reflecting CLAUDE §1 pricing (DR-05). `api_key` UNIQUE. |
| `users` | yes (`client_id`) | auth | `role ∈ {admin, analyst, viewer}`, default `viewer`. `hashed_password` = bcrypt (SR-01). |
| `data_sources` | yes | onboarding / MCP | `credentials` JSONB stores **AES-256 ciphertext** only (SR-04; MCP §5). `config` holds filters/webhooks. |
| `raw_feedback` | yes | ingestion (n8n→ingest) | `processed` is the ingestion↔analysis handoff (SYSTEM §4.2). `source_id` → `data_sources(id)` **no cascade**. |
| `feedback_insights` | yes | **VoC agent** | `sentiment_score ∈ [-1,1]`; `urgency_score ∈ [0,1]`; `sentiment_label ∈ {positive, negative, neutral, mixed}`; `churn_risk ∈ [0,1]`; `themes` JSONB array; `feedback_ids UUID[]` traces sources. |
| `competitive_signals` | yes | **CompSig agent** | `urgency ∈ {critical, high, medium, low}`; `signal_type ∈ {pricing, product_launch, hiring, …}`. `is_read` drives portal UX. |
| `journey_events` | yes | ingestion (MCP tools) | `event_type ∈ {page_view, click, form_start, abandon, …}`; `occurred_at` = source time, `ingested_at` = arrival. |
| `journey_insights` | yes | **Journey agent** | `friction_cause ∈ {ux_friction, messaging, expectation}`; `drop_off_rate`, `friction_score`, `projected_lift` are FLOATs. |
| `knowledge_embeddings` | **partial** (`client_id` nullable; NULL = global) | embedding service | `vector(1536)`; ivfflat cosine index; retrieved via `<=>` (RAG §3). |
| `reports` | yes | report service / n8n | `report_type ∈ {weekly_voc, competitive_brief, journey, weekly_intelligence, …}`; `s3_key` = S3 path (INFRA §4). |

---

## 5. Schema change governance (AUD-04 / RISK-08 / D3)

> **DEFAULT (pending ratification — D3 / AUD-04 / RISK-08):** **Alembic** is the **sole schema authority**. Alembic pairs naturally with the SQLAlchemy `models/` already in CLAUDE §4 and is the standard async-compatible migration tool. It is a §3 stack addition and therefore **requires maintainer approval**; flagged here and in PROJECT_STRUCTURE §4.

Rules (binding once ratified; the design holds regardless of tool):
- **Migrations are the only way schema changes ship.** Every change is a reviewed, version-controlled migration with a working `upgrade` and `downgrade` (MASTER_ROADMAP §5.4 exit: "migration up/down works").
- **No production auto-DDL.** The Build Guide's `create_tables()` startup call (AUD-04) is permitted **only** for ephemeral local/test environments — never production. The startup path must not silently create or alter schema in prod (RISK-08).
- **Additive-only without a ruling.** New nullable columns, new tables (following §2 conventions), and new indexes are permitted as ordinary reviewed migrations. Renames, type changes, drops, and convention changes require explicit human approval (CLAUDE §5 immutable rule).
- **The migration set, not the ORM models or `create_tables`, is the source of truth** for what exists in the database.

---

## 6. Data-access path & DSN handling (AUD-02 / AUD-03 / D2)

> **DEFAULT (pending ratification — D2 / AUD-03):** the **runtime query path is raw `asyncpg`** through the shared pool (`database.py`). SQLAlchemy `models/` exist **only** for migrations and typing — they are **not** a parallel query path. This prevents the two-paradigm drift AUD-03 warns about (schema defined in one place, queried in another).

> **Resolved (AUD-02 — DSN dialect mismatch):** the SQLAlchemy/Alembic URL uses the `postgresql+asyncpg://` dialect; **`asyncpg.connect`/pool construction needs a raw DSN without the `+asyncpg` prefix.** Maintain **two** config values — a SQLAlchemy URL (for Alembic/models) and a raw asyncpg DSN — rather than reusing one string. `config.py` exposes both; the pool consumes the raw DSN (BACKEND §5). Never pass the `+asyncpg` URL to `asyncpg`.

---

## 7. Tenant-table inventory (for RLS — detail in MULTI_TENANT_SECURITY)

All of these are tenant-scoped via `client_id` and **must** be tenant-filtered on every access (CLAUDE §5 "Tables that require client isolation"):

`users`, `data_sources`, `raw_feedback`, `feedback_insights`, `competitive_signals`, `journey_events`, `journey_insights`, `reports`, and `knowledge_embeddings` (client-specific rows; NULL rows are intentionally global).

RLS is **enabled by CLAUDE §5 on five core tables**: `raw_feedback`, `feedback_insights`, `competitive_signals`, `journey_events`, `journey_insights`, with the `client_isolation` policy applied to **every** RLS-enabled table. Extending RLS to `data_sources`, `reports`, and client-specific `knowledge_embeddings` is **recommended (flag for approval)** for defense-in-depth (CLAUDE §5). The policy text, the `app.current_client_id` lifecycle, the pooled-connection sharp edge, and the isolation test are owned by **MULTI_TENANT_SECURITY**.

---

## 8. Retention & zero-trust (SR-06 / CLAUDE §14)

The durable record is **derived insights, not raw customer source data** (CLAUDE §2, §14; ADR §4.5). Design consequence for the schema:
- Insight tables (`feedback_insights`, `competitive_signals`, `journey_insights`, `reports`) are the long-term record and are persisted indefinitely (subject to per-client policy).
- `raw_feedback` and `journey_events` are **processed in transit and drained/aged** — they are working data marked via `processed`, not a permanent store (SYSTEM §4.2). The daily checklist verifies `raw_feedback` is draining, i.e. not accumulating `processed = FALSE` (CLAUDE §16).
- `data_sources.credentials` is the only place third-party secrets persist, and only as AES-256 ciphertext (SR-04; MULTI_TENANT_SECURITY §6).

This retention posture is part of the GDPR/SOC-2 alignment (CLAUDE §14; RISK-15) and is designed in P2, enforced through P4.

---

## 9. Scalability & indexing notes (NFR-04 / RISK-09)

- **Vector index:** ivfflat with `lists = 100` is the fixed starting point (CLAUDE §5). Recall/latency are monitored; `lists` tuning and a possible future extraction to a dedicated ANN store are **post-MVP** concerns, pre-considered but not built (RISK-09; ADR-003 consequence).
- **Hot-path indexes (additive, expected):** the VoC fetch (`WHERE client_id = $1 AND processed = FALSE`) and the dashboard summary read benefit from supporting indexes; these are additive migrations and do not alter the canonical columns. Specific index DDL is deferred to the P2 migration work, not fixed here.
- **One instance, shared budget:** OLTP and vector search contend on one RDS instance (ADR-003 trade-off); load modeling at the 500-client target is a P10 exit gate (NFR-04).

---

## 10. Verification (P2 done-when — from MASTER_ROADMAP §5.4)

- Every table is queryable and matches the spec **exactly** (no renames vs CLAUDE §5).
- `uuid-ossp` and `vector` extensions present; ivfflat index exists; a similarity query returns results (DR-03).
- A cross-tenant query under RLS returns **∅** (NFR-01 — proven in MULTI_TENANT_SECURITY's isolation test).
- Migration `upgrade`/`downgrade` works; schema review signs off with no renames.
- Stored credentials are AES-256 ciphertext at rest (SR-04).

---

*DataAutomated.io — DATABASE_FOUNDATION.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces CLAUDE.md §5; governed by ADR-003/004/010.*
