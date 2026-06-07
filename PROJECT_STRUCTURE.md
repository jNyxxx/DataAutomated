# PROJECT_STRUCTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The exact, approved repository layout and the rules for where every file belongs — so future phases place code without guessing and reviewers can reject misplacement on sight.
> **Governing sources:** `CLAUDE.md` §4 (repository structure), §3 (stack — what may exist), §17 (git workflow / commit scopes), §19 (build order), §20 (operating instructions); `ARCHITECTURE_DECISION_RECORDS.md` §6 ("extend the three agents; do not add a fourth architecture"); `MASTER_ROADMAP.md` §2.2 (AUD-03 ORM/raw-SQL, AUD-04 migrations).
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) · [MCP_ARCHITECTURE](MCP_ARCHITECTURE.md) · [RAG_ARCHITECTURE](RAG_ARCHITECTURE.md) · [FRONTEND_ARCHITECTURE](FRONTEND_ARCHITECTURE.md) · [INFRASTRUCTURE_ARCHITECTURE](INFRASTRUCTURE_ARCHITECTURE.md) · [IMPLEMENTATION_SEQUENCE](IMPLEMENTATION_SEQUENCE.md)

---

## 1. Authority and intent

The structure below is reproduced **exactly** from `CLAUDE.md` §4 and is **already decided** (CLAUDE §0, §20). This document adds only: the *purpose and ownership rule* of each folder, the *file-placement decision rules*, the *permitted additions*, and the mapping of folders to *conventional-commit scopes*. It introduces no new top-level structure. Claude **MUST** follow this layout precisely; new files go in the matching existing folder; new top-level folders require explicit approval (CLAUDE §4 rules).

---

## 2. Canonical repository tree (reproduced from CLAUDE §4)

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

---

## 3. Folder ownership rules (the placement contract)

Each folder has **one** responsibility; code that does not match is misplaced regardless of whether it works (SYSTEM_ARCHITECTURE §3; CLAUDE §4).

| Path | Owns | Hard rule | Detailed in |
|---|---|---|---|
| `backend/app/main.py` | FastAPI app construction; router inclusion with prefixes/tags; startup/shutdown (pool lifecycle) | The only place routers are wired in | BACKEND §2, §3 |
| `backend/app/config.py` | Environment config via `pydantic-settings`; no hardcoded secrets | Secrets come from env / Secrets Manager only (CLAUDE §14) | INFRASTRUCTURE §6 |
| `backend/app/database.py` | The single asyncpg connection **pool** and the tenant-context-on-checkout helper | All DB access goes through here; no ad-hoc `asyncpg.connect` (AUD-05/08) | MULTI_TENANT_SECURITY §4, BACKEND §5 |
| `backend/app/models/` | SQLAlchemy ORM models **for migrations/typing only** | Not a runtime query path (AUD-03, D2) | DATABASE_FOUNDATION §6 |
| `backend/app/routers/` | FastAPI route handlers, one module per domain | Thin: validate → call service/dispatch → return; no business logic | BACKEND §3 |
| `backend/app/agents/` | The three LangGraph `StateGraph` agents — **and only these three** | No 4th agent / competing orchestration (ADR §6; CLAUDE §7) | AGENT §2 |
| `backend/app/tools/` | MCP tool definitions (BaseTool subclasses) + registry/base | New external source = new tool here, never inline in an agent (ADR-009) | MCP §2 |
| `backend/app/services/` | Business logic: NLP, embedding/RAG, report generation | The single embedding service lives only here (ADR-010) | BACKEND §3, RAG §2 |
| `frontend/app/` | Next.js App Router route segments (server-first) | Pages map 1:1 to CLAUDE §11 routes | FRONTEND §3 |
| `frontend/components/` | Shared UI components (KPI/snapshot cards, etc.) | Reusable, presentational; no direct backend secrets | FRONTEND §5 |
| `frontend/lib/` | Typed API client (`api.ts`) and client utilities | The single data-access path to the backend | FRONTEND §4 |
| `n8n/workflows/` | Exported workflow JSON, version-controlled | Built locally, exported, committed; prod runs the exports (CLAUDE §13) | INFRASTRUCTURE §7 |
| repo root | `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example` | `.env` itself is **never** committed (CLAUDE §14, §17) | INFRASTRUCTURE §5 |

> **Note on illustrative files:** the specific filenames shown in CLAUDE §4 (e.g. `zendesk_tool.py`, `scraper_tool.py`, `client.py`) are representative of the *kind* of file in each folder. The MVP tool catalog (MCP §3) and model set are governed by their owning documents; placement is what this document fixes.

---

## 4. Permitted additions (no approval needed)

`CLAUDE.md` §4 explicitly permits these beyond the verbatim tree:

- **`backend/tests/`** — pytest suite (unit/agent/integration), expected per CLAUDE §16. Mirrors `app/` layout (e.g. `tests/test_voc_agent.py`).
- **`backend/app/tools/registry.py`** — the central `TOOL_REGISTRY` + `get_tools_for_client` (named in CLAUDE §8).
- **`backend/app/tools/base_tool.py`** — the BaseTool pattern shared by tools (named in CLAUDE §8).

### Additions requiring an explicit flag (committed defaults)

> **DEFAULT (pending ratification — D3 / AUD-04):** an **`backend/alembic/`** migrations directory (plus `alembic.ini`) as the sole schema authority. Alembic is a §3 stack addition requiring approval; flagged here, owned by DATABASE_FOUNDATION §5. Until ratified, treat the directory as the planned home for migrations.

Any **other** new top-level folder, or any new folder that introduces a *new architecture* (a second agent framework, a parallel vector store, a second data-access path), is **forbidden without explicit human approval** (CLAUDE §4, §20; ADR §6).

---

## 5. File-placement decision rules

When adding a file, resolve placement by asking, in order:

1. **Is it a new external integration?** → a tool in `backend/app/tools/` + a `registry.py` entry. Never an inline API call in an agent (ADR-009; MCP §2).
2. **Is it new AI capability?** → a new **node** inside one of the three existing agents in `backend/app/agents/`, or a new tool. Never a new agent file beyond the three (CLAUDE §7; ADR §6).
3. **Is it reusable business logic (NLP, embedding, reporting)?** → a function in an existing `backend/app/services/` module. Embeddings go **only** through `embedding_service.py` (ADR-010; RAG §2).
4. **Is it an HTTP endpoint?** → a handler in the matching `backend/app/routers/` module (auth/insights/signals/journeys). Keep handlers thin (BACKEND §3).
5. **Is it a DB query?** → it executes through the `database.py` pool with tenant context set; it does not open its own connection (AUD-05/08; MULTI_TENANT_SECURITY §4).
6. **Is it a UI surface?** → a route segment under `frontend/app/` (server component by default) and/or a shared component in `frontend/components/`; data access via `frontend/lib/api.ts` (FRONTEND §3).
7. **Is it scheduling/delivery?** → an n8n workflow exported to `n8n/workflows/`, not application code (CLAUDE §13; ADR-006).

If none match, the change likely violates a §18 gate — **STOP** and surface it (CLAUDE §18, §20).

---

## 6. Build-order constraint on structure

Folders come into existence in the dependency order of `CLAUDE.md` §19 / `MASTER_ROADMAP.md` §4 (see IMPLEMENTATION_SEQUENCE): database foundation before any router; an agent's persistence target table must exist before the agent; the dashboard for a service is not built before that service's agent persists results. Creating a folder early is fine; *depending* on an unbuilt earlier phase is not (CLAUDE §19).

---

## 7. Commit scopes mapped to structure (CLAUDE §17)

Conventional commits are `type(scope): description`. Scopes map to the architecture/folders:

| Scope | Region | Example |
|---|---|---|
| `db` | `models/`, migrations, schema | `feat(db): add ivfflat index on knowledge_embeddings` |
| `auth` | `routers/auth.py`, JWT/middleware | `fix(auth): resolve jwt validation issue` |
| `fastapi` | `main.py`, `routers/`, pool, middleware | `fix(fastapi): resolve token expiry bug in auth middleware` |
| `voc-agent` | `agents/voc_agent.py` | `feat(voc-agent): add sentiment scoring pipeline` |
| `comp-signal-agent` | `agents/comp_signal_agent.py` | `feat(comp-signal-agent): add signal classifier node` |
| `journey-agent` | `agents/journey_agent.py` | `feat(journey-agent): add dropoff calculation node` |
| `mcp` | `tools/`, `registry.py` | `feat(mcp): add typeform response tool` |
| `rag` | `services/embedding_service.py`, RAG node | `feat(rag): add rag_context node to voc graph` |
| `frontend` | `frontend/**` | `feat(frontend): add KPI row to dashboard` |
| `n8n` | `n8n/workflows/` | `chore(n8n): export churn-alert workflow` |
| `docker` | Dockerfiles, compose | `chore(docker): update postgres image to 16` |
| `aws` | deploy/infra config | `chore(aws): add ecs autoscaling policy` |

Branch from `main`, PR-only merges, never push to `main` directly, never commit `.env` (CLAUDE §17).

---

## 8. Anti-patterns (reject in review)

- A fourth file in `backend/app/agents/` (a new agent) — violates ADR §6 / CLAUDE §7.
- A vendor API call inside an agent node instead of a tool — violates ADR-009 / MCP §2.
- A second embedding/RAG implementation outside `services/embedding_service.py` — violates ADR-010 / RAG §2.
- A raw `asyncpg.connect(...)` outside the `database.py` pool — violates AUD-05/08.
- A new top-level folder or a SPA framework swap — violates CLAUDE §3, §4.
- A committed `.env` — violates CLAUDE §14, §17.

---

*DataAutomated.io — PROJECT_STRUCTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces and operationalizes CLAUDE.md §4.*
