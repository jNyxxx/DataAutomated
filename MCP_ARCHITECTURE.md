# MCP_ARCHITECTURE.md — DataAutomated.io

> **Status:** Authoritative implementation architecture. Version 1.0 | June 2026 | Confidential — Engineering Use Only.
> **Purpose:** The blueprint for the MCP tool layer — the uniform boundary through which agents reach every external source. Define a tool once; call it from any agent. This is what quarantines integration churn from agent logic.
> **Governing sources:** `CLAUDE.md` §8 (MCP tool system), §6 (per-client scoping), §14 (credential encryption); `ARCHITECTURE_DECISION_RECORDS.md` ADR-009 (MCP tool layer); `MASTER_ROADMAP.md` OR-04, FR-CSE-02, FR-BJI-01, DR-04, SR-04, AUD-13 (scraping), RISK-06 (ToS/legal), RISK-10 (rate limits/outages).
> **Sibling documents:** [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [AGENT_ARCHITECTURE](AGENT_ARCHITECTURE.md) (consumers) · [DATABASE_FOUNDATION](DATABASE_FOUNDATION.md) (`data_sources`) · [MULTI_TENANT_SECURITY](MULTI_TENANT_SECURITY.md) (credential encryption) · [BACKEND_ARCHITECTURE](BACKEND_ARCHITECTURE.md) (pool).
> **Scope boundary:** No tool implementation as a deliverable. This fixes the tool contract, registry pattern, catalog, and policies the P5 implementation realizes.

---

## 1. Why a tool boundary (ADR-009)

Agents must reach a large, growing, per-client set of third-party sources, each with its own auth, payload shape, and failure mode (forcing function #4). If agents called these APIs directly, integration churn and credential handling would smear across agent logic and every new source would mean editing agents (ADR-009 context). The decision: **all external integrations behind a uniform, self-describing tool abstraction**, registered centrally and resolved per-client. **Agents invoke tools; they never call vendor APIs directly** (ADR-009; CLAUDE §8).

> **RULE:** New integrations are added as **new MCP tools + registry entries** — **never** as inline API calls inside an agent node (CLAUDE §8; ADR-009 future constraint; PROJECT_STRUCTURE §5).

---

## 2. Tool implementation contract (CLAUDE §8)

Each tool:
- Lives in `backend/app/tools/` and subclasses `langchain.tools.BaseTool` (the `base_tool.py` pattern — PROJECT_STRUCTURE §4).
- Declares a Pydantic `args_schema` (`BaseModel` with `Field(description=...)`) — **every argument documented**, and **`client_id` is always an explicit argument** (CLAUDE §8; tenancy never inferred — CLAUDE §6).
- Has a stable `name` (the canonical tool name) and a clear `description` telling the agent when to use it.
- Fetches **encrypted per-client credentials from the DB** (`data_sources.credentials`), **decrypts at the app layer**, then calls the external API. **Credentials never live in code or env for per-client integrations** (CLAUDE §8; SR-04).
- Returns **normalized** data shaped for the agent (e.g. `[{"id", "content", "metadata": {...}}]`), **not** raw vendor payloads (CLAUDE §8).

Conceptual surface (illustrative, not buildable):
```
class SomeSourceTool(BaseTool):
    name = "fetch_<source>_<thing>"
    description = "When to use this tool…"
    args_schema = SomeArgs   # includes client_id: UUID = Field(description="…")
    async def _arun(self, client_id, ...):
        creds = await load_and_decrypt_credentials(client_id, source_type)  # app-layer AES-256 decrypt
        raw   = await call_vendor(creds, ...)                               # with backoff/retry
        return normalize(raw)                                               # -> [{id, content, metadata}]
```

---

## 3. Tool naming standard & MVP catalog (CLAUDE §8)

**Naming:** `fetch_*` for API pulls, `scrape_*` for public-page scraping, `search_*` for query-based discovery. Names are `snake_case` and match the registry keys/source types.

**Official MVP tool set** (reproduced exactly — CLAUDE §8):

| Tool name | Data source | Used by |
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

The long-term target is pre-built connectors for **200+ platforms via MCP**; the table is the MVP subset (CLAUDE §8). P5 exit requires **≥5 tools** across this catalog (MASTER_ROADMAP §5.7).

---

## 4. Registry & per-client resolution (OR-04)

All tools register in a central registry so agents resolve tools dynamically per client (reproduced from CLAUDE §8):

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

> **RULE:** a client only ever gets tools for sources they have **actually connected** (`get_tools_for_client`); **never** call a tool for an unconnected source (CLAUDE §8; tenancy — CLAUDE §6). `get_client_data_sources` reads `data_sources` **tenant-scoped** via the pool helper (MULTI_TENANT_SECURITY §4; BACKEND §5).

---

## 5. Credential handling (SR-04 / DR-04 / CLAUDE §14)

- Per-client credentials persist **only** in `data_sources.credentials` as **AES-256 ciphertext**, encrypted at the app layer **before** the DB write (DATABASE_FOUNDATION §4; MULTI_TENANT_SECURITY §6).
- The encryption key is **KMS-backed** (AUD-12); decryption happens **only inside the tool boundary at call time** (ADR-009 rationale: credential handling isolated in tools).
- **Decrypted credentials are never** stored at rest, logged, returned in responses, or passed to the frontend (CLAUDE §14; MULTI_TENANT_SECURITY §6).
- Tool output is **untrusted input** to the agent (treat scraped/fetched content as potentially adversarial — AUD-11; AGENT §7) and is normalized + validated before the agent consumes it.

---

## 6. Resilience (RISK-10)

- **Per-source backoff/retry** inside each tool handles third-party rate limits and transient outages (RISK-10; MASTER_ROADMAP §5.7).
- **Graceful degradation:** a failing source degrades that signal stream, not the whole agent run; ingestion is decoupled from analysis so a slow/down source does not stall analysis (SYSTEM §4.2; ADR §4.2).
- Tool failures are observable (logged to CloudWatch; surfaced in the agent's LangSmith trace).

---

## 7. Scraping policy (AUD-13 / RISK-06 / D5) — resolve-now + in-phase

> **DEFAULT (policy — D5 / AUD-13 / RISK-06):** **prefer official/licensed APIs over scraping.** Where a licensed API exists (e.g., **SerpAPI / News API** for `search_news_signals`), use it instead of scraping. The `scrape_*` tools (`scrape_g2_reviews`, `scrape_capterra_reviews`, `fetch_linkedin_jobs` scraper) require **legal review before P5** for ToS/legal exposure, must be **isolated** so their fragility/legal risk doesn't contaminate other tools, and must **degrade gracefully** when blocked or changed (AUD-13; RISK-06). Pending maintainer ruling on the scraping policy (D5); flagged here and gated at P5 entry.

---

## 8. Verification (P5 done-when — MASTER_ROADMAP §5.7)

- Each tool returns **normalized** data from its API (integration test — CLAUDE §16).
- `get_tools_for_client` returns **only** the sources a client has connected (OR-04).
- Stored credentials are AES-256 ciphertext; decryption is tool-boundary-only (SR-04/DR-04).
- Scrapers operate within the ratified legal policy (D5/RISK-06).
- ≥5 tools across the official catalog implemented; per-source backoff/retry present (RISK-10).
- No inline vendor calls exist inside any agent node (ADR-009; PROJECT_STRUCTURE §8 anti-pattern).

---

*DataAutomated.io — MCP_ARCHITECTURE.md v1.0 | June 2026 | Confidential — Engineering Use Only. Reproduces CLAUDE.md §8; governed by ADR-009.*
