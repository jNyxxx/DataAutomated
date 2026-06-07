# MULTI_TENANT_SECURITY.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for the platform's highest-stakes invariant — **tenant isolation** — plus the surrounding security model (auth handoff, secret encryption, audit trail, prompt-injection posture). Cross-tenant leakage is an existential failure, not a bug (ADR §1, forcing function #3).
> **Governing sources:** `CLAUDE.md` §2, §5 (RLS + `app.current_client_id`), §6 (multi-tenancy rules), §10 (auth), §14 (security); `ARCHITECTURE_DECISION_RECORDS.md` ADR-004 (RLS), ADR-003 (unified store), ADR-011 (JWT), §4.6 (data-layer tenancy theme); `MASTER_ROADMAP.md` NFR-01, SR-01…06, AUD-05 (conn-per-node), AUD-08 (pooled-conn isolation), AUD-11 (prompt injection), AUD-12 (secrets), RISK-01 (leakage), RISK-05 (injection), RISK-12 (secret compromise).
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (schema/tenant tables) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (pool/middleware) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) (agent DB access) · [MCP_ARCHITECTURE](MCP_ARCHITECTURE.md) (credential decrypt) · [INFRASTRUCTURE_ARCHITECTURE](INFRASTRUCTURE_ARCHITECTURE.md) (Secrets Manager/KMS).

---

## 1. The invariant

> **No cross-tenant data leakage is architecturally impossible, not merely prevented** (ADR §6). Isolation lives at the **data layer** and **fails closed**; application scoping is a redundant second line. Two independent mechanisms must both fail for a leak to occur (ADR-004; CLAUDE §2, §6).

This is the platform's most important invariant; there are **no exceptions** (CLAUDE §6). It is gate #3 of the §18 framework and the first thing every data path must satisfy.

---

## 2. Defense in depth — the two layers

```
                 Authenticated request OR background/agent task
                                   │
              ┌────────────────────▼─────────────────────┐
              │ LAYER 1 (PRIMARY): PostgreSQL RLS         │
              │ Policy: client_id = current_setting(      │
              │          'app.current_client_id')::UUID   │
              │ Fails CLOSED: omission ⇒ ∅, not ⇒ all     │  [ADR-004]
              └────────────────────┬─────────────────────┘
                                   │
              ┌────────────────────▼─────────────────────┐
              │ LAYER 2 (REDUNDANT): explicit app scoping │
              │ Every tenant query also has WHERE         │
              │ client_id = $1 (belt and suspenders)      │  [CLAUDE §6]
              └───────────────────────────────────────────┘
```

- **Layer 1 — RLS (the backstop that cannot be forgotten):** a query that forgets its tenant predicate returns the active tenant's rows or nothing — never another tenant's data (ADR-004 rationale). This holds regardless of which service, agent, or future code path issues the query.
- **Layer 2 — explicit `client_id` scoping:** every agent/application tenant query *also* carries `WHERE client_id = $1` (CLAUDE §6; the reference agents already do this). RLS without app scoping is still safe; app scoping without RLS is not — both are mandatory.

---

## 3. RLS enablement & policy (reproduced from CLAUDE §5)

RLS is enabled on the **five core tenant-data tables**, with the canonical policy applied to **every** RLS-enabled table:

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

- **RULE:** apply `client_isolation` to **every** RLS-enabled table (CLAUDE §5 "Repeat for all RLS-enabled tables"). A table with RLS enabled but no policy denies all access — both the `ENABLE` and the `CREATE POLICY` are required per table.
- **RECOMMENDED (flag for approval):** extend RLS + the policy to the remaining tenant tables — `data_sources`, `reports`, and client-specific `knowledge_embeddings` — for defense-in-depth (CLAUDE §5). `knowledge_embeddings` needs a policy that *also* admits global rows, e.g. `client_id = current_setting('app.current_client_id')::UUID OR client_id IS NULL`, to preserve the NULL=global semantics (DATABASE_FOUNDATION §4; RAG §3). **Do not remove or weaken any existing policy.**

> **DEFAULT (flag — extension to data_sources/reports/knowledge_embeddings):** adopt the recommended extension, pending maintainer approval, because every one of these tables holds tenant-sensitive data and the cost is one policy each. Marked here; ratify before those tables are read on shared connections.

---

## 4. `app.current_client_id` — the lifecycle and the sharp edge

RLS only protects connections **where the session variable is set** (ADR-004 trade-off; AUD-08). This is the single most dangerous edge in the system, and the design below closes it.

### 4.1 Request path (CLAUDE §5)
At the start of **every authenticated request**, before any tenant-table query, the auth middleware sets the session variable from the **server-derived** `client_id` carried in the validated JWT:

```python
await conn.execute(
    f"SET app.current_client_id = '{current_user.client_id}'"
)
```

> **SECURITY NOTE (CLAUDE §5; do not "fix" against spec):** the f-string is acceptable **only** because `client_id` is a server-derived UUID from the validated token — never raw user input. When refactoring, prefer `SET LOCAL` inside a transaction and/or `set_config(...)` parameterization. **Never** interpolate untrusted input into SQL (CLAUDE §14). The value is trusted solely because it comes from the authenticated token (ADR-011 → RLS handoff, §5 below).

### 4.2 The pooled/background sharp edge (AUD-05 / AUD-08 / RISK-01) — RESOLVE-NOW

The reference agent code opens `asyncpg.connect(...)` per node and the pooled `database.py` is bypassed (AUD-05); separately, **any** connection that skips the request middleware (pooled checkouts, background tasks, agent paths) can operate **outside** the RLS guarantee (AUD-08). Both are closed by one design standard:

> **DESIGN STANDARD (D4 / AUD-05 / AUD-08 / RISK-01/02):**
> 1. **All DB access goes through the single shared pool** in `database.py`. No ad-hoc `asyncpg.connect` anywhere — including agents and tools (AUD-05; BACKEND §5; AGENT §6).
> 2. **A mandatory tenant-context helper sets `app.current_client_id` on every checkout used for tenant data** — request paths *and* agent/background paths alike. Prefer `SET LOCAL` within a transaction so the setting is scoped to that unit of work and cannot leak to the next checkout from the pool.
> 3. **Belt-and-suspenders:** agent/tool tenant queries still carry `WHERE client_id = $1` (CLAUDE §6), so even a mis-set session context cannot leak.

Conceptual contract (illustrative, not buildable code):

```
# database.py — single source of pooled, tenant-scoped connections
async def acquire_for_client(client_id: UUID) -> Connection:
    """Check out a pooled connection, set tenant context (SET LOCAL in a txn),
    and hand it back. The ONLY sanctioned way agents/tools/requests touch
    tenant data. client_id MUST come from a trusted source (JWT claim or an
    explicit, server-controlled agent dispatch argument)."""
```

### 4.3 The isolation test (the proof — P3 exit gate)

> **DESIGN STANDARD:** an automated test must prove that a **pooled/background connection cannot read another tenant's rows** (MASTER_ROADMAP §5.5 exit; RISK-01). Shape:
> 1. Seed two clients (A, B) each with rows in every RLS table.
> 2. Acquire a pooled connection with tenant context = A; assert queries return **only** A's rows and **∅** of B's — including a query that *omits* the explicit `WHERE client_id` (to prove RLS alone holds).
> 3. Acquire on a **background/agent-style** checkout (no request middleware) and repeat — proving the helper, not the middleware, is what enforces context.
> 4. Assert that a checkout with **no** tenant context set cannot read tenant rows (fails closed).
>
> This test is a permanent regression guard; it runs in CI and is part of the P10 load-tested isolation exit (MASTER_ROADMAP §5.12).

---

## 5. Auth → tenancy handoff (ADR-011 / SR-01 / SR-02)

The auth mechanism exists in part to feed tenancy: the JWT carries `sub` (user id) and **`client_id`**, and that tenant claim flows directly into the RLS session context on every request (ADR-011; CLAUDE §10).

> **DEFAULT (pending ratification — D1 / AUD-01 / RISK-07):** authentication = **custom-JWT backend** (HS256, `JWT_SECRET_KEY`, `python-jose` + `passlib[bcrypt]`), with `/auth/token` login and `get_current_user` dependency, per the Build Guide. Optionally fronted by Clerk for frontend session/user management later. **The `client_id` token claim is fixed regardless of the ruling** — whichever way D1 resolves, the backend's reliance on a verified per-request tenant claim is the invariant (ADR-011 "fixed point"). **Do not delete the `users` table or JWT machinery to switch to Clerk-only without approval** (CLAUDE §3 KNOWN DISCREPANCY). Flag this in any auth PR.

Requirements (SR-01/SR-02; detail in BACKEND §4):
- Passwords hashed with **bcrypt** via `passlib`; tokens signed with `JWT_SECRET_KEY`/`JWT_ALGORITHM` (HS256); expiry per `ACCESS_TOKEN_EXPIRE_MINUTES` (default 60 — AUD-12).
- Every data endpoint depends on `get_current_user` (OAuth2 bearer, `tokenUrl="/auth/token"`).
- Middleware sets `app.current_client_id` before any tenant query (§4.1).
- Invalid/missing token → 401; **error bodies never leak another tenant's data or internal secrets** (CLAUDE §10, §14).

---

## 6. Secret & credential handling (SR-03 / SR-04 / AUD-12 / RISK-12)

| Secret class | Storage | Rule |
|---|---|---|
| App secrets / API keys (JWT signing key, OpenAI key, etc.) | **AWS Secrets Manager** in prod; env via `pydantic-settings` | Never hardcoded; `.env` git-ignored and never committed (CLAUDE §14, §17; SR-03) |
| Per-client integration credentials (`data_sources.credentials`) | PostgreSQL, **AES-256 ciphertext only**, encrypted at the **app layer before** the DB write | Never stored decrypted at rest; never passed to the frontend; decrypted only inside the MCP tool boundary at call time (SR-04; ADR-009; MCP §5) |

> **DEFAULT (AUD-12 / RISK-12):** the credential-encryption key is **KMS-backed**; JWT TTL is short (60 min, env-configurable); a **rotation plan** covers both the signing key and per-client creds; a **denylist option** is available for token revocation given JWT's stateless revocation weakness (ADR-011 trade-off). Owned operationally by INFRASTRUCTURE §6; designed in P3, hardened in P9.

**Never** log, return, or embed secrets, raw credentials, JWTs, or another tenant's data anywhere (CLAUDE §14). **Never** disable/weaken/bypass RLS, auth, encryption, or the audit trail "to make something work" (CLAUDE §14, §20).

---

## 7. Audit trail (SR-05 / CLAUDE §14)

A **complete audit trail** records all data access and all AI agent actions (CLAUDE §2, §14; SR-05). Design posture:
- **Agent actions** are inherently traced in **LangSmith** on every run (`@traceable` entry points, NFR-03; AGENT §5) — this is the agent-action audit substrate.
- **Data access & system events** are logged to **CloudWatch** in production (INFRASTRUCTURE §5), centralized across all containers.
- Audit scaffolding is stood up in P3 (alongside auth/middleware) and present across all phases (SR-05; MASTER_ROADMAP §5.5). Audit records **must not** contain secrets, raw credentials, or cross-tenant data (CLAUDE §14).

---

## 8. Prompt-injection posture (AUD-11 / RISK-05)

Ingested feedback and scraped content flow into LLM prompts; malicious content could attempt to manipulate narratives or classifications (AUD-11). Not addressed in the source docs, resolved in-phase (P4):

> **DESIGN STANDARD (resolve-in-phase, P4):**
> - **Treat all tool/LLM output and all ingested content as untrusted input.**
> - **Instruction isolation / input demarcation** in prompts: clearly fence ingested content away from system instructions so content cannot pose as instructions.
> - **Output schema validation**: agent NLP nodes return *validated* structured JSON (e.g., per-item `sentiment_score`, `intent`, `churn_signal`); malformed/inconsistent output is rejected, not trusted (AGENT §4).
> - **No tool execution driven by ingested content** — content can never cause a tool/agent to take an action; agents decide actions from validated state only.
> Owned by AGENT §7; this is the security contract the agents implement.

---

## 9. Multi-tenancy operating rules (CLAUDE §6 — reproduced as binding)

- **MUST** scope every tenant query via RLS **and** explicit `WHERE client_id = $1`.
- **MUST** give every service, agent, tool, and background task an explicit `client_id` (argument or derived from the authenticated request) — **never infer or default it**.
- **MUST NOT** read, join, or aggregate across multiple clients in a tenant-facing query (no `GROUP BY client_id` cross-tenant aggregation).
- **MUST NOT** expose another client's `id`, `api_key`, data, or insights in any response, log, alert, report, or error.
- **MUST** have MCP tools load only the connected sources/credentials for the given `client_id` (MCP §4).
- **MUST** have background/agent DB connections set `app.current_client_id` (or filter explicitly) — RLS only protects connections where the session var is set (§4.2).

**Correct (tenant-scoped):**
```python
rows = await conn.fetch(
    "SELECT id, content FROM raw_feedback "
    "WHERE client_id = $1 AND processed = FALSE LIMIT 500",
    state["client_id"],
)
```
**Forbidden:** any tenant query without a tenant predicate, or any cross-tenant aggregation (CLAUDE §6 examples).

---

## 10. Verification (NFR-01 + P2/P3 exits)

1. RLS enabled + `client_isolation` policy present on every RLS-enabled table; recommended extension applied (if ratified) preserving `knowledge_embeddings` global-row semantics.
2. **Cross-tenant query under RLS returns ∅** (NFR-01; P2 exit).
3. **The isolation test (§4.3) passes** on both request and pooled/background connections, including the omit-`WHERE` case and the no-context-set case (RISK-01; P3 exit, re-validated under load in P10).
4. JWT auth issues tokens at `/auth/token`; protected routes reject missing/invalid tokens (SR-01); middleware sets `app.current_client_id` (SR-02).
5. Stored credentials are AES-256 ciphertext at rest; no secrets in the repo (SR-03/04).
6. Audit records exist for data access and agent runs; LangSmith shows traces (SR-05; NFR-03).

---

*DataAutomated.io — MULTI_TENANT_SECURITY.md v1.0 | June 2026 | Confidential — Engineering Use Only. Governed by ADR-004/003/011 and CLAUDE.md §2/§5/§6/§14.*
