# FRONTEND_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for the Next.js client portal — clean, fast, data-dense, server-first, real-time. It renders sensitive tenant-scoped intelligence and authenticates every data access against the backend.
> **Governing sources:** `CLAUDE.md` §11 (frontend standards), §12 (real-time SSE), §3 (Next.js/TS/Tailwind/Recharts/Resend), §10 (CORS/auth/errors); `ARCHITECTURE_DECISION_RECORDS.md` ADR-007 (App Router server-first), ADR-012 (SSE); `MASTER_ROADMAP.md` FR-DASH-01/02/03, FR-ONB-01, NFR-05/§1.8 (page load), NFR-06 (no polling), RISK-13 (SSE connection load), AUD-07.
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (API/SSE provider) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (token handling) · [INFRASTRUCTURE_ARCHITECTURE](INFRASTRUCTURE_ARCHITECTURE.md) (CloudFront/ECS frontend).
> **Scope boundary:** No React components, pages, or `api.ts` as deliverables. This fixes the rendering model, page map, data-access contract, and real-time pattern the P8 implementation realizes.

---

## 1. Why server-first (ADR-007)

The portal renders sensitive, tenant-scoped intelligence and must authenticate every access. The architectural question is **where data fetching and the auth boundary live** — on the server, close to the token and API, or in the browser. The decision: **Next.js App Router, data-fetching pages as Server Components by default**, with Client Components reserved for genuinely interactive/real-time surfaces (ADR-007; CLAUDE §11).

> **RULE:** new portal surfaces **default to server components** and justify any move to client-side fetching — the server-first posture is the standing default, not a per-page coin flip (ADR-007 future constraint). Tokens and raw tenant payloads stay **off the browser** (ADR-007 rationale; MULTI_TENANT_SECURITY §6).

---

## 2. Core principles (CLAUDE §11)

- **Server Components first.** Pages are async Server Components that fetch on the server (e.g. `DashboardPage` awaits `fetchDashboardSummary()`). Use Client Components only where interactivity/real-time requires it (`useEffect`, `EventSource`, toasts).
- **TypeScript strict mode** across the frontend (CLAUDE §3, §11).
- **All charts use Recharts.** No alternative charting library (CLAUDE §3, §11).
- Data access goes through the **typed API client** `frontend/lib/api.ts` (§4); every request sends `Authorization: Bearer <token>`.
- `NEXT_PUBLIC_API_URL` configures the backend base (`http://localhost:8000` dev; `https://api.dataautomated.io` prod).
- **Approved deps:** `recharts @radix-ui/react-dialog lucide-react date-fns`. Adding new UI deps requires justification (CLAUDE §11).

---

## 3. Page map (CLAUDE §11) → App Router segments

The 5 core pages + supporting routes, under `frontend/app/` (PROJECT_STRUCTURE §3):

```
/dashboard        → Overview: all three services at a glance        (FR-DASH-01)
/insights         → VoC: sentiment trends, theme breakdown, churn   (FR-DASH-02)
/insights/[id]    → Single insight deep-dive with full narrative
/signals          → Competitive: signal feed, competitor profiles
/signals/[id]     → Single signal with strategic context
/journeys         → Journey: funnel visualization, friction heatmap
/journeys/[id]    → Single journey audit with recommendations
/reports          → Report history with download links              (FR-RPT-01 surface)
/settings         → Data source connections, alert preferences      (FR-ONB-01)
```

- Each page is server-first and **authenticates against the FastAPI backend**; it renders only the **authenticated tenant's** data (CLAUDE §11; MULTI_TENANT_SECURITY §1).
- `/settings` is the **onboarding entry** — connect a data source, configure alerts (FR-ONB-01); connecting a source writes to `data_sources` via the backend (DATABASE_FOUNDATION §4; MCP §4).
- The detail routes (`/[id]`) are deep-dives consuming the same tenant-scoped read endpoints (BACKEND §3).

> **Build-order constraint:** the dashboard for a service is **not** built before that service's agent persists results (CLAUDE §19; IMPLEMENTATION_SEQUENCE).

---

## 4. Typed API client contract (`frontend/lib/api.ts`)

The single data-access path to the backend (CLAUDE §11):
- Exposes typed functions: `apiRequest`, `fetchDashboardSummary`, `fetchInsights`, `fetchSignals`, `triggerAnalysis`, … (CLAUDE §11), mapping to the BACKEND §3 endpoint contract.
- Every request sends `Authorization: Bearer <token>`; the base URL is `NEXT_PUBLIC_API_URL`.
- **Error handling:** any non-OK response is treated as an error (`if (!res.ok) throw …`) (CLAUDE §10, §11). Error surfaces never expose internal/tenant detail (MULTI_TENANT_SECURITY §6).
- The known auth comment ("Implement with next-auth or Clerk") ties to the **D1 open decision** (MULTI_TENANT_SECURITY §5): the `client_id`-bearing JWT contract is fixed regardless of how session/user management is fronted.

---

## 5. UI patterns (keep stable — CLAUDE §11)

- **KPI row** of `KPICard`s on the dashboard: **Sentiment Score, Churn Risk, New Signals**, with status/badge logic — e.g. churn `> 0.15` ⇒ `warning` (consistent with the VoC alert threshold, AGENT §3.1).
- **Per-service snapshot cards:** `VoCSnapshotCard`, `CompSignalCard`, `JourneySnapshotCard`.
- **Reusable card/grid layout:** `grid grid-cols-3 gap-*`, `p-6 space-y-6`. Shared components live in `frontend/components/` (PROJECT_STRUCTURE §3).
- Charts (sentiment trends, funnel/friction, signal velocity) use **Recharts** only.

---

## 6. Real-time via SSE (ADR-012 / CLAUDE §12 / NFR-06) — consumer side

- **Transport:** Server-Sent Events. The frontend consumes `GET /stream/insights` via `EventSource` (BACKEND §7 provides it).
- **Update handling:** on message, parse JSON, **prepend** to the list state, **show a toast** ("New insight available"); always `eventSource.close()` on unmount (CLAUDE §11, §12). This is a Client Component island (interactivity required).
- **No client polling.** Client-side polling of REST endpoints to simulate real-time is **not allowed** (CLAUDE §12; NFR-06). The sanctioned server-side 5s check lives in the backend generator, not the browser.
- **Connection caps/backoff (AUD-07 / RISK-13):** long-lived SSE connections scale with concurrent dashboards; cap and back off reconnections for MVP; the move to event-on-persist notification is post-MVP and does not change the SSE transport (BACKEND §7; ADR-012 future constraint).

---

## 7. Security posture (MULTI_TENANT_SECURITY §5/§6)

- Tokens and raw tenant payloads are handled **server-side**; the server/client boundary is where the attack surface shrinks (ADR-007 rationale).
- CORS on the backend allows only `http://localhost:3000` (dev) and `https://app.dataautomated.io` (prod), `allow_credentials=True` (CLAUDE §10; BACKEND §2).
- The portal **never** displays another tenant's data — enforced server-side by RLS + scoping, and by fetching only via the authenticated, tenant-scoped API (MULTI_TENANT_SECURITY §1).

---

## 8. Performance (NFR-05 / §1.8)

- **Dashboard page load < 1.5s** (§1.8) — server-first rendering collapses client waterfalls (ADR-007 rationale).
- `GET /api/dashboard/summary` backing the dashboard targets **< 300ms** (BACKEND §3; §1.8).
- Server Components stream data-dense pages without a chain of browser fetches.

---

## 9. Verification (P8 done-when — MASTER_ROADMAP §5.10)

- A client logs in and sees **live tenant data** across the 5 pages + detail routes (FR-DASH-01/02).
- A **new insight appears via SSE without refresh** (FR-DASH-03); no client-side polling (NFR-06).
- Dashboard load **< 1.5s** (§1.8).
- `/settings` can connect a data source (FR-ONB-01).
- Charts are Recharts; only approved deps present (CLAUDE §11).

---

*DataAutomated.io — FRONTEND_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Governed by ADR-007/012 and CLAUDE.md §11/§12.*
