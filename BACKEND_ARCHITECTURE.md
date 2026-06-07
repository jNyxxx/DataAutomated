# BACKEND_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for the FastAPI application tier — the system's "brain stem": it authenticates, sets tenant context, accepts work fast, dispatches agents to the background, serves persisted reads, and hosts the SSE stream. It never blocks on an agent run.
> **Governing sources:** `CLAUDE.md` §10 (API design), §3 (FastAPI/asyncpg), §2 (async-first, agents off request path), §12 (SSE), §13 (n8n endpoint contract); `ARCHITECTURE_DECISION_RECORDS.md` ADR-001 (FastAPI), ADR-005 (background tasks), ADR-011 (JWT), §4.3 (async-first theme); `MASTER_ROADMAP.md` NFR-02, NFR-05/§1.8 (perf), SR-01/02/05, AUD-02 (DSN), AUD-03 (raw asyncpg), AUD-05 (pool), AUD-06 (durability), RISK-02/04.
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (DSN/schema) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (auth/pool/RLS) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) (dispatch target) · [FRONTEND_ARCHITECTURE](FRONTEND_ARCHITECTURE.md) (API/SSE consumer) · [INFRASTRUCTURE_ARCHITECTURE](INFRASTRUCTURE_ARCHITECTURE.md) (n8n caller).
> **Scope boundary:** No route handler code, no request/response bodies as deliverables. This fixes the *contract and patterns* the P3 implementation follows.

---

## 1. Why FastAPI, and the one rule that follows (ADR-001)

The backend's primary job is to **dispatch and coordinate AI work whose steps take 5–30s, for hundreds of tenants concurrently** (ADR-001; forcing function #1). A thread-per-request framework would exhaust its worker pool waiting on LLM/external I/O. FastAPI's `async def` cooperative scheduling lets a small worker pool hold thousands of in-flight awaits on slow I/O. The single rule that follows and governs this entire tier:

> **Async-first is a system property, not a style** (ADR §4.3). Any synchronous, blocking call in a hot path is an **architectural defect**, not merely slow. Every dependency in a request path must be async (this is why asyncpg, not psycopg2 — ADR-003; CLAUDE §3).

---

## 2. Application composition (`app/main.py`)

`main.py` is the only place the app is assembled (PROJECT_STRUCTURE §3):
- Constructs the FastAPI app; includes each router with its prefix + tag (§3 below).
- **Startup:** create the shared asyncpg **pool** (§5); initialize config from `pydantic-settings`; turn on LangSmith env (NFR-03). `create_tables()` is **local/test only**, never prod (DATABASE_FOUNDATION §5; AUD-04).
- **Shutdown:** close the pool gracefully.
- **CORS:** allow only `http://localhost:3000` (dev) and `https://app.dataautomated.io` (prod), `allow_credentials=True` (CLAUDE §10).
- The app is **stateless** — all durable state lives in PostgreSQL/S3 — so it scales horizontally behind the ALB (INFRASTRUCTURE §3; NFR-04).

---

## 3. Layering & router map

```
HTTP / n8n / SSE
      │
      ▼
routers/ (thin)  ──validate, authn/authz, dispatch or read, shape response
      │
      ▼
services/  ──business logic: nlp_service, embedding_service, report_service
      │
      ▼
database.py pool  ──raw asyncpg, tenant-context-on-checkout  [single data path, AUD-03/05/08]
      │
      ▼
PostgreSQL + pgvector
```

- **Routers stay thin:** validate input → set/inherit tenant context → either **dispatch a background task** (writes/triggers) or **read the latest persisted result** → return. No business logic, no direct vendor calls, no inline SQL spread across handlers.
- **Services hold logic;** the embedding service is the *only* RAG path (ADR-010; RAG §2).
- **Data access only via the pool** (MULTI_TENANT_SECURITY §4).

### Router organization (CLAUDE §10)
| Router | Prefix | Tag |
|---|---|---|
| `auth.router` | `/auth` | Authentication |
| `insights.router` | `/insights` | VoC Insights |
| `signals.router` | `/signals` | Competitive Signals |
| `journeys.router` | `/journeys` | Journey Analytics |

### Endpoint contract (stable published interface — CLAUDE §10/§13; ADR-006)
These paths are a **contract** with n8n and the frontend; **renaming requires a coordinated workflow change in the same PR** (ADR-006; CLAUDE §13).

| Path | Purpose | Caller | Latency target |
|---|---|---|---|
| `POST /auth/token` | JWT login | frontend | — |
| `POST /insights/analyze` | Trigger VoC analysis (background) | frontend/n8n | < 100ms (NFR-02) |
| `GET /insights/latest` | Latest persisted VoC insight | frontend | — |
| `GET /stream/insights` | SSE stream of new insights | frontend | long-lived |
| `POST /api/agents/voc/run` | Run VoC agent (background) | n8n | < 100ms |
| `POST /api/agents/competitive-signal/run` | Run CompSig agent (background) | n8n | < 100ms |
| `POST /api/ingest/trigger` | Trigger ingestion sweep | n8n | fast |
| `POST /api/reports/generate` | Generate report → S3 | n8n | async |
| `GET /api/clients/active-list` | Active clients to loop over | n8n | — |
| `GET /api/clients/with-competitive-monitoring` | Clients with CompSig enabled | n8n | — |
| `GET /api/dashboard/summary` | Dashboard aggregate (one tenant) | frontend | **< 300ms** (§1.8) |
| `POST /webhook/churn-alert` | Churn webhook entry (n8n side) | VoC→n8n | — |

(Signals/journeys follow the same read/trigger shape as insights; the n8n-facing `/api/*` set is the published contract per CLAUDE §13.)

---

## 4. Auth boundary (ADR-011 / SR-01 / SR-02)

> **DEFAULT (pending ratification — D1 / AUD-01):** custom-JWT backend (see MULTI_TENANT_SECURITY §5). `client_id` claim fixed regardless.

- **`get_current_user`** dependency on **every** data endpoint; `OAuth2PasswordBearer(tokenUrl="/auth/token")`.
- JWT carries `sub` + `client_id`; created by `create_access_token`, expires per `ACCESS_TOKEN_EXPIRE_MINUTES` (60, AUD-12). HS256 via `JWT_SECRET_KEY`/`JWT_ALGORITHM`. Passwords bcrypt via `passlib`.
- **Auth middleware sets `app.current_client_id`** for the request connection **before any tenant query** (CLAUDE §5; MULTI_TENANT_SECURITY §4.1).
- **Errors:** `HTTPException` with correct codes (401 invalid/missing token). Bodies never leak tenant data or secrets (CLAUDE §10, §14).

---

## 5. Connection pool & tenant-context helper (AUD-05 / AUD-08 / RISK-01/02) — critical

> **DESIGN STANDARD (D4):** `database.py` owns the **single shared asyncpg pool**. **No ad-hoc `asyncpg.connect`** anywhere — agents and tools included (AUD-05). Every checkout that touches tenant data passes through the **tenant-context helper** that sets `app.current_client_id` (prefer `SET LOCAL` in a transaction) before the connection is used (MULTI_TENANT_SECURITY §4.2). This simultaneously retires **RISK-02** (connection exhaustion from connection-per-node at 500 clients) and the leakage half of **RISK-01**.

> **Resolved (AUD-02 — DSN):** the pool is constructed from a **raw asyncpg DSN** (no `+asyncpg` dialect prefix); the `postgresql+asyncpg://` URL is for SQLAlchemy/Alembic only. `config.py` exposes both values (DATABASE_FOUNDATION §6).

Conceptual surface (illustrative):
```
# database.py
pool: asyncpg.Pool                       # created on startup, closed on shutdown
async def acquire_for_client(client_id)  # pooled conn with tenant context set (the sanctioned path)
async def acquire_admin()                # non-tenant ops only (e.g. /api/clients/active-list reads clients)
```
The dashboard/read endpoints, the agents (AGENT §6), and the tools all acquire through this helper; none open their own connections.

---

## 6. Background-task dispatch (ADR-005 / NFR-02) — the latency rule

> **RULE (CLAUDE §2, §10):** **MUST NOT** run a LangGraph agent synchronously inside an HTTP request. Trigger endpoints enqueue work and return immediately.

Pattern (reproduced from CLAUDE §10):
```python
@router.post("/analyze")
async def trigger_voc_analysis(background_tasks: BackgroundTasks,
                               current_user = Depends(get_current_user)):
    background_tasks.add_task(run_voc_analysis, client_id=current_user.client_id)
    return {"status": "analysis_queued", "message": "You'll be notified when complete"}
```

- **Trigger endpoints respond `< 100ms`** (NFR-02; §1.8); the agent runs off the request path (5–30s) and persists results.
- **Read endpoints** fetch the latest persisted result (e.g., `GET /insights/latest` → `fetch_latest_insight(client_id)`), never re-run the agent.
- The dispatched function receives `client_id` as an **explicit argument** (never inferred — CLAUDE §6) and acquires DB connections via the tenant-context helper (§5).

### Durability posture (ADR-005 trade-off / AUD-06 / RISK-04)
In-process `BackgroundTasks` do **not** survive a container restart and offer no retry/dead-letter (ADR-005 consequence; AUD-06). MVP mitigation (accept-with-mitigation):
- Agent entry points are **idempotent and broker-portable** — parameterized by `client_id`, no reliance on in-request state — so a future move to a dedicated broker/worker is a substitution, not a rewrite (ADR-005 future constraint; AGENT §8).
- **n8n scheduled sweeps re-trigger** lost work, softening the durability gap (SYSTEM §4.4; ADR §4.4). Revisit a broker post-MVP (RISK-04).

---

## 7. SSE endpoint (ADR-012 / CLAUDE §12) — backend side

The backend hosts `GET /stream/insights` returning a `StreamingResponse(media_type="text/event-stream")` (CLAUDE §12). The sanctioned detection mechanism is a **server-side check every 5s** inside the SSE generator that pushes when a new insight exists for the tenant:
```python
yield f"data: {json.dumps(new_insight)}\n\n"
```
- This is **server-side** polling (the sanctioned mechanism), **not** client polling — client-side polling of REST to simulate real-time is forbidden (CLAUDE §12; NFR-06).
- The stream is **tenant-scoped** (the generator reads only the authenticated tenant's new insights via the pool helper).
- **Accept-with-mitigation (AUD-07/RISK-13):** the 5s per-connection poll scales poorly with many concurrent dashboards; cap/backoff connections for MVP, and plan an **event-on-persist** notification post-MVP rather than abandoning SSE (ADR-012 future constraint). Consumption side: FRONTEND §6.

---

## 8. Error handling & observability

- Use `HTTPException` with correct status codes; the frontend treats any non-OK as an error (`if (!res.ok) throw …`) (CLAUDE §10; FRONTEND §4).
- **Never** leak another tenant's data or internal secrets in error bodies (CLAUDE §10, §14; MULTI_TENANT_SECURITY §6).
- Logs go to **CloudWatch** in prod (INFRASTRUCTURE §5); agent runs trace in **LangSmith** (AGENT §5). Audit scaffolding (SR-05) is stood up here in P3 (MULTI_TENANT_SECURITY §7).

---

## 9. Scalability properties (NFR-04)

- **Stateless tasks** behind the ALB autoscale 2→10 (INFRASTRUCTURE §3); no sticky sessions (stateless JWT — ADR-011).
- **Async I/O multiplexing** lets the 2-task baseline absorb bursty high-latency traffic and scale linearly (ADR-001).
- **Pooled DB access** bounds connections at scale (RISK-02); agents off the request path keep the request tier responsive (forcing functions #1/#2).

---

## 10. Verification (P3 done-when — MASTER_ROADMAP §5.5; §1.8)

- `/docs` (OpenAPI) shows all endpoints; JWT auth passes; protected routes reject missing/invalid tokens.
- **Trigger endpoint responds `< 100ms`** (NFR-02); `GET /api/dashboard/summary` `< 300ms` (§1.8, validated P8/P10).
- **The isolation test proves a pooled/background connection cannot read another tenant's rows** (MULTI_TENANT_SECURITY §4.3; RISK-01/02 retired).
- AUD-02 DSN handling resolved (raw DSN for pool, dialect URL for Alembic).
- No agent runs synchronously in a request (ADR-005 verified by trigger latency).

---

*DataAutomated.io — BACKEND_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Governed by ADR-001/005/011 and CLAUDE.md §10/§12/§13.*
