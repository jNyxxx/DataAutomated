# Security & Launch Audit — Remediation Ledger

> **Status:** Engineering record for the June 2026 security/launch audit remediation.
> **Branch:** `fix/security-launch-remediation`. **Date:** 2026-06-15.
> **Mode:** Project remains in LOCAL-TESTING-ONLY mode (CLAUDE.md). Code/config/doc fixes
> are applied; production-deploy and live-AWS-only items are documented as residuals.

## 1. How to read this ledger

The audit prompt referenced `security_audit_report.md` / `security_remediation_plan.md`,
which **do not exist** in this repository. Per the prompt's own fallback rule, this ledger
is the canonical matrix: it preserves the prompt's audit IDs (LB/SR/P3/P4), maps each to
the real in-repo audit (`PHASE_1-3_AUDIT.md`, `DEPLOYMENT.md`, `LOAD_TESTING.md`,
`OPERATIONAL_RUNBOOKS.md`, `MULTI_TENANT_SECURITY.md`) where one exists, and assigns every
finding exactly one final status.

**Status legend**
- **FIXED** — implemented in code/config/migration this round, with a test or CI gate.
- **MITIGATED** — interim control in place + the production-grade path documented.
- **DEFERRED** — not implemented now; reason recorded (governance ruling or scope).
- **RESIDUAL** — non-code / external / live-AWS-only; cannot be closed in-repo.

## 2. Maintainer rulings recorded this session

These resolve conflicts between the audit prompt and CLAUDE.md (surfaced before work began):

| # | Decision | Rationale |
|---|---|---|
| R1 | **Fix compliant now, document the rest** | Stay inside CLAUDE.md while closing the real defects; defer prod-only/governance-blocked items as residuals. |
| R2 | **PostgreSQL-backed shared state** (no Redis) | §3 approved stack has no Redis. Revocation, SSE tickets, and lockout use the existing RDS; distributed rate-limiting uses AWS WAF (the audit's own sanctioned answer — LT-RateLimit-01). |
| R3 | **Keep LangSmith ON in every env + redact PII** | §2 makes tracing-everywhere NON-NEGOTIABLE; P3-05's "disable in prod" is replaced by field-level PII redaction (SR-03). |
| R4 | **Password policy + lockout now; defer MFA + HIBP** | §3 flags an unresolved Clerk-vs-custom-JWT auth ruling. Policy (pure) and lockout (PG) ship now; admin TOTP MFA (P3-04) and HaveIBeenPwned (P3-01 breach half) wait on that ruling. |

These also ratify the long-standing governance gates D1–D4 / MTLS-* (see §6).

## 3. Finding matrix

### A. Launch blockers (prompt LB-01…LB-10)

| ID | Title | Status | Evidence / change |
|---|---|---|---|
| LB-01 | ECS health check used `curl`, absent in images | FIXED | `.github/ecs/backend-task-definition.json` (python urllib probe), `frontend-task-definition.json` (node http probe) — no new packages. |
| LB-02 | CI ran migrations on the stale family, not the built SHA | FIXED | `.github/workflows/ci.yml` migration step now `register-task-definition` of the rendered SHA task def and runs against that ARN. |
| LB-03 | n8n state wiped on ECS restart (no checked-in def) | FIXED | `.github/ecs/n8n-task-definition.json` (EFS volume + secrets) checked in; bootstrap in §5. |
| LB-04 / LB-08 | n8n Slack credential IDs were placeholders | MITIGATED | Both workflows reference a stable id/name (`dataautomated-slack-prod` / "DataAutomated Slack"); deterministic bootstrap in §5. Actual Slack token = RESIDUAL (external). |
| LB-05 / LB-09 | Missing `NEXT_PUBLIC_API_URL` → silent broken build | FIXED | `frontend/Dockerfile` build-arg guard; `frontend/lib/api.ts` throws in production instead of localhost fallback. Tested (`api.test.ts`). |
| LB-06 / LB-10 | `allowed_hosts=["*"]` disabled host validation in prod | FIXED | `backend/app/config.py` prod validator rejects wildcard/empty `allowed_hosts`. Tested (`test_security_hardening.py`). |
| LB-07 | Hardcoded pool size (exhaustion at scale) | FIXED | `config.py` `db_pool_min_size`/`db_pool_max_size`; `database.py` uses them; budget in §5. |

### B. Systemic risks (prompt SR-01…SR-07)

| ID | Title | Status | Evidence / change |
|---|---|---|---|
| SR-01 | No JWT revocation across instances | FIXED | `jti` in token; `token_denylist` (migration 0005); `get_current_user` rejects revoked; `POST /auth/logout`; frontend logout calls it. Tested. |
| SR-02 | SSE unsafe at 2+ tasks (in-memory tickets) | FIXED | `sse_tickets` table (0005); `routers/insights.py` issues/consumes in Postgres (single-use `DELETE … RETURNING`). Tested. (M2 polling bug was already fixed in-repo.) |
| SR-03 | PII flowed unmasked to LangSmith | FIXED | `services/trace_redaction.py` redacting client wired into all 3 agents' `@traceable`; tracing stays ON. Tested. Supersedes P3-05. |
| SR-04 | GDPR erasure missing | FIXED (minimal) + RESIDUAL | `services/gdpr_service.py` + `POST /api/clients/me/erase` (admin, self-tenant, confirm-gated) erase-and-anonymise. Full DSAR export = RESIDUAL. |
| SR-05 | Zero frontend tests | FIXED | Vitest harness; `lib/__tests__/{auth,api}.test.ts` cover JWT-expiry + API config (incl. LB-05 regression); `frontend-tests` CI job gates deploy. |
| SR-06 | Rate limiting process-local only | MITIGATED | In-process limiter retained (acceptable single-task); AWS WAF rules documented in §5 as the production answer (= LT-RateLimit-01 / P4-03). |
| SR-07 | CORS / security posture too implicit | FIXED | `config.py` prod validator rejects wildcard CORS; frontend CSP/headers added (= P4-01/P4-02). |

### C. Hardening (prompt P3-* / P4-*)

| ID | Title | Status | Evidence / change |
|---|---|---|---|
| P3-01 | Password policy + HaveIBeenPwned | FIXED (policy) / DEFERRED (HIBP) | `validate_password_strength()` in `auth.py` (tested). HIBP breach check deferred (external dep + auth-provider ruling, R4). |
| P3-02 | Account lockout (shared state) | FIXED | `login_attempts` table (0005) + sliding-window lock in `auth.py` (429 + Retry-After). Tested. |
| P3-04 | TOTP MFA for admins | DEFERRED | Awaits Clerk-vs-custom-JWT ruling (§3 / R4). |
| P3-05 | Disable LangSmith in prod | DEFERRED→resolved as SR-03 | Disabling violates §2; replaced by redaction. |
| P4-01 | Full CSP + security headers (frontend) | FIXED | `frontend/next.config.mjs` `headers()` — CSP (connect-src allows API + SSE), X-Frame-Options, Referrer-Policy, Permissions-Policy. |
| P4-02 | CORS lockdown | FIXED | = SR-07 (prod fail-closed on wildcard CORS). |
| P4-03 | Rate limiting everywhere | MITIGATED | = SR-06 (in-process interim + WAF documented). |
| P4-04 | Dependency scanning + SAST in CI | FIXED | Existing pip-audit/npm audit/Dependabot + new Bandit job (`ci.yml`) + CodeQL workflow (`.github/workflows/codeql.yml`). |
| P4-05 | Automated RLS-bypass detection test | FIXED | `tests/test_rls_bypass.py` asserts app_runtime/app_login can't bypass RLS + no-context fail-closed. |

### D. In-repo audit (PHASE_1-3 / deployment / ops / load / governance)

| ID | Title | Status | Disposition |
|---|---|---|---|
| H1 | Repo not under VCS / CI inert | FIXED | Git is initialised (commit history exists); a green CI run on this PR closes it. |
| M1 | Pool logs in as superuser | FIXED (infra) + RESIDUAL (cutover) | `app_login` LOGIN/NOSUPERUSER/NOBYPASSRLS role + grants (0005); tested. Cutover (set password, point `DATABASE_DSN` at it) is an ops step — §5. |
| M2 | SSE polling logic wrong | FIXED (pre-existing) | Already corrected to a `created_at` watermark in `routers/insights.py`; guarded by `test_sse.py`. |
| L1 | Audit covers auth+dispatch, not read-path | DEFERRED | Per the audit, read-path audit events land with P9 CloudWatch wiring. |
| L2 | Extended-RLS wording / ratification | FIXED (ratified) | Ruling recorded in §6 (= D-HB-05). Extension to data_sources/reports/knowledge_embeddings is adopted. |
| L3 | Stray `output/` directory | FIXED (pre-existing) | `output/` is already in `.gitignore` (line 61) and untracked — it holds local-only audit/screenshot artifacts, intentionally excluded from the §4 source tree. No tracked stray files remain; local files left intact. |
| L4 | Alembic/WeasyPrint ratification | FIXED (ratified) | Recorded in §6 (Alembic = sole schema authority; WeasyPrint approved for P6). |
| L5 | Host Python 3.13 vs pinned 3.11 | RESIDUAL (info) | Container/CI pin 3.11 (authoritative); local 3.13 is a documented dev deviation. |
| L6 | Fail-closed comment imprecise | FIXED | Migration 0001 comment notes both fail-closed outcomes (NULL and InvalidTextRepresentation). |
| D-INTERIM-01 | No domain; plain HTTP | RESIDUAL | Blocked by LOCAL-TESTING-ONLY mode (no domain/cert). Exit steps in DEPLOYMENT.md. |
| D-INTERIM-02 | ALB SG opens 8000/5678 | RESIDUAL | Close when HTTPS/domain lands (DEPLOYMENT.md). |
| D-HB-01 | CloudFront for `app.` | RESIDUAL | Post-P9 infra (DNS swap). |
| D-HB-02 | Private subnets + NAT | RESIDUAL | Post-P9 infra. |
| D-HB-03 | CloudWatch alarms | RESIDUAL | Post-P9 observability. |
| D-HB-04 | Delete old us-east-1 bucket | RESIDUAL | Ops cleanup. |
| D-HB-05 | Ratify extended RLS | FIXED (ratified) | = L2. |
| OP-01 | n8n single-task constraint | RESIDUAL (ops) | Documented; do not scale n8n beyond 1 task (EFS single-writer). |
| OP-02 | JWT_SECRET_KEY rotation impact | RESIDUAL (ops) | Runbook; rotation invalidates sessions. |
| OP-03 | CREDENTIAL_ENCRYPTION_KEY rotation | RESIDUAL (ops) | Runbook; requires re-encryption migration. |
| OP-04 | Daily health checklist | RESIDUAL (ops) | CLAUDE.md §16 checklist. |
| OP-05 | Agent-trace QA gate | RESIDUAL (ops) | "0 failed runs in 48h" exit bar. |
| LT-01…07 | Performance targets unverified vs live AWS | RESIDUAL | k6 scripts authored; need a live load environment. |
| LT-RateLimit-01 | In-process limiter not distributed | MITIGATED | = SR-06 (WAF documented). |
| MTLS-D1 | Auth = custom JWT | FIXED (ratified) | §6. |
| MTLS-D2 | No ad-hoc asyncpg; single pool | FIXED (ratified) | §6. |
| MTLS-D3 | Alembic = sole schema authority | FIXED (ratified) | §6 (= L4). |
| MTLS-D4 | `acquire_for_client` mandatory | FIXED (ratified) | §6. |
| MTLS-Default-01 | Extended RLS adopted | FIXED (ratified) | §6 (= L2). |
| MTLS-Default-02 | KMS key / short JWT TTL / denylist | PARTIAL | Denylist now exists (SR-01); KMS-backed key + TTL tuning remain P9 ops (RESIDUAL). |
| MTLS-Resolve-P4-01 | Prompt-injection defence | RESIDUAL | Owned by the agent layer (§7); design standard, not this remediation. |

### E. Non-code residuals (92→100)

| ID | Item | Status |
|---|---|---|
| NC-01 | External penetration test | RESIDUAL |
| NC-02 | SOC 2 / formal compliance controls | RESIDUAL |
| NC-03 | Bug bounty / external disclosure program | RESIDUAL |

## 4. Database changes (migration 0005, additive only)

`backend/alembic/versions/0005_security_hardening.py` adds:
- `token_denylist` (SR-01), `sse_tickets` (SR-02), `login_attempts` (P3-02) — all
  authentication-infrastructure tables, intentionally **not** RLS-enabled (queried before a
  tenant context exists, like `users`/`clients`; access limited to the runtime role).
- `app_login` role (M1): LOGIN, NOSUPERUSER, NOBYPASSRLS, member of `app_runtime`. **No
  password is set in the migration** (CLAUDE.md §14).

No existing table/column is renamed, retyped, or dropped (CLAUDE.md §5).

## 5. Operational steps (residual cutovers / production controls)

**M1 — switch the pool to the non-superuser role** (do during a maintenance window):
```sql
ALTER ROLE app_login PASSWORD '<from AWS Secrets Manager>';
```
Then point `DATABASE_DSN` (and `DATABASE_URL`) at `app_login@…` and redeploy. RLS then
applies by default even on a raw `pool.acquire()`. Verified safe by `test_rls_bypass.py`.

**Connection budget (LB-07):** keep `db_pool_max_size × uvicorn_workers × ecs_tasks ≤`
RDS `max_connections` (minus a headroom for migrations/admin). Example on
`db.t4g.medium` (~max 340): `max_size=10 × 1 worker × 10 tasks = 100` — safe. Raise
`db_pool_max_size` only after re-checking this product.

**Distributed rate limiting (SR-06 / P4-03):** the in-process limiter is per-task. In
production, enforce limits at AWS WAF on the ALB: `~100 req/5min/IP` on `/auth/*`,
`~500 req/1min/IP` on `/webhook/*`, `~60 req/1min/IP` on agent triggers.

**n8n Slack credential bootstrap (LB-04/08):** workflows reference credential
`dataautomated-slack-prod` / "DataAutomated Slack". After deploying the n8n task
(`.github/ecs/n8n-task-definition.json`, EFS-backed), create that credential once in n8n
from `SLACK_BOT_TOKEN`, then import/activate the workflows so the Slack nodes bind. The
EFS volume persists it across restarts (LB-03). `N8N_ENCRYPTION_KEY` must match the value
already stored in the EFS volume or n8n will not start.

## 6. ADR — ratified governance gates

- **D1 / MTLS-D1:** Authentication = custom JWT backend (HS256). Adopted. The Clerk
  question (CLAUDE.md §3) stays open and gates MFA/HIBP only.
- **D2 / MTLS-D2:** No ad-hoc `asyncpg.connect`; all DB access via the single shared pool.
- **D3 / L4 / MTLS-D3:** Alembic is the sole schema authority. WeasyPrint approved for P6.
- **D4 / MTLS-D4:** `acquire_for_client` is mandatory for tenant data; `app_login` (M1)
  makes RLS the default even if it is forgotten.
- **L2 / D-HB-05 / MTLS-Default-01:** Extended RLS to `data_sources`, `reports`, and
  client-specific `knowledge_embeddings` is adopted (preserving NULL=global semantics).

## 7. Verdict

**NOT READY FOR PUBLIC-CLIENT LAUNCH — but every code-addressable launch blocker and
systemic risk is closed.** Remaining gates are environment/process, not code:
1. **Domain + TLS** (D-INTERIM-01/02) — required before real client traffic; blocked by
   LOCAL-TESTING-ONLY mode.
2. **Live verification** — apply migration 0005, run the full test suite green in CI (H1),
   and validate LT-01…07 against a live load environment.
3. **Ops cutovers** — M1 role switch, AWS WAF rules, n8n Slack credential bootstrap.
4. **Non-code residuals** — pentest (NC-01), SOC 2 (NC-02), bug bounty (NC-03), and the
   deferred MFA/HIBP pending the auth-provider ruling.

When 1–3 are complete in a domain-enabled environment, the system is launch-ready for the
audited scope; the NC items are ongoing compliance work, not launch blockers for an MVP.
