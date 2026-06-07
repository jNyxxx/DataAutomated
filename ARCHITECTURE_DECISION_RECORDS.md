# ARCHITECTURE_DECISION_RECORDS.md — DataAutomated.io

> **Purpose:** This document records *why* the DataAutomated.io system is built the way it is.
> It is the rationale companion to `CLAUDE.md`. Where `CLAUDE.md` states the rules (the *what*
> and the *how*), this document argues the *why* — the problems, the alternatives weighed, the
> tradeoffs accepted, and the consequences we now live with. It is written for architects
> performing future audits, evaluating change requests, or onboarding into the system.
>
> **Scope discipline:** No rule lists, no schema, no folder layout, no implementation steps, no
> product/UI/marketing content. Only architectural reasoning.
>
> **Version:** 1.0 | June 2026 | Confidential — Engineering Use Only

---

## 1. PROJECT CONTEXT

DataAutomated.io is an **AI-native, multi-tenant intelligence platform** delivered as managed
SaaS. The workload is not a conventional CRUD application with an ML feature attached; the unit
of work *is* an AI computation. Three long-running agent pipelines (voice-of-customer,
competitive signal, behavioral journey) continuously ingest heterogeneous external data,
perform multi-step LLM/ML analysis, and persist *interpreted* output — narratives,
strategic context, prioritized recommendations — rather than raw data.

Architecture decisions matter disproportionately here because the workload imposes five
**forcing functions** that ordinary web stacks do not face. Every decision in §3 is justified
against these axes:

1. **Agent latency (5–30s per run).** LLM-driven, multi-step work cannot occupy a request
   thread. Latency is not an optimization target — it is a structural constraint that dictates
   the concurrency model, the API contract, and the real-time delivery mechanism.
2. **The scale mandate (100 → 500+ clients).** Every component must hold at 500 tenants with no
   redesign. This biases the system toward stateless, horizontally scalable compute and a single
   well-understood data tier rather than a sprawl of specialized services.
3. **Hard tenant isolation.** A multi-tenant intelligence product holds competitively sensitive
   customer data. Cross-tenant leakage is an existential failure, not a bug. This pushes
   isolation toward the lowest, least-bypassable layer.
4. **Heterogeneous, unstable external sources.** Dozens-to-hundreds of third-party APIs and
   scraped sources, each with its own auth, shape, and failure mode. This demands an abstraction
   boundary so integration churn does not leak into agent logic.
5. **Observability and auditability.** AI output is non-deterministic and must be debuggable in
   production, and all data access must be auditable for compliance. This makes tracing and
   audit first-class architectural concerns, not afterthoughts.

The decisions that follow are coherent *as a set*: they repeatedly trade raw flexibility and
best-of-breed specialization for **operational simplicity, isolation guarantees, and
predictable behavior at scale** — the properties that matter most for a small team operating a
high-stakes, AI-heavy platform.

---

## 2. CORE ARCHITECTURAL DECISIONS (MASTER LIST)

| ADR | Decision | One-line rationale |
|---|---|---|
| ADR-001 | **FastAPI** as backend framework | Async-first is structurally required for 5–30s agent calls. |
| ADR-002 | **LangGraph** for agent orchestration | Stateful, inspectable graphs beat opaque call chains for multi-step AI. |
| ADR-003 | **PostgreSQL + pgvector** as unified data + vector store | One store keeps relational and vector data consistent and isolated. |
| ADR-004 | **Row-Level Security** for multi-tenancy | Isolation enforced at the data layer can't be forgotten in code. |
| ADR-005 | **Async background-task** agent execution | Slow AI work must be decoupled from the request lifecycle. |
| ADR-006 | **n8n** for workflow orchestration | Scheduling/delivery belongs outside application code. |
| ADR-007 | **Next.js App Router** for frontend | Server-first rendering reduces data exposure and round-trips. |
| ADR-008 | **Docker + AWS ECS Fargate** for deployment | Autoscaling containers meet the scale mandate without k8s tax. |
| ADR-009 | **MCP tool layer** for integrations | A uniform tool boundary contains integration churn. |
| ADR-010 | **RAG via a central embedding service** | One retrieval path guarantees consistent, explainable context. |
| ADR-011 | **JWT** authentication | Stateless tokens fit horizontal scaling and feed the RLS context. |
| ADR-012 | **Server-Sent Events** for real-time | Unidirectional push matches an agent-completion notification model. |

---

## 3. ARCHITECTURE DECISIONS (DETAILED ADR ENTRIES)

### ADR-001: FastAPI as the Backend Framework

#### Status
Accepted.

#### Context
The backend's primary job is to dispatch and coordinate AI agent work whose individual steps
take seconds, not milliseconds, and to do so for hundreds of tenants concurrently. A framework
whose concurrency model is built on synchronous, thread-per-request handling would exhaust its
worker pool waiting on LLM and external-API I/O long before CPU or memory became the bottleneck.

#### Decision
Use FastAPI (async Python) as the single backend framework for the REST API, auth boundary, and
agent dispatch.

#### Alternatives Considered
- **Flask** — mature and minimal, but synchronous by default; async support is bolted on and the
  ecosystem assumes blocking I/O.
- **Django (+ DRF)** — batteries-included, but heavyweight and tightly coupled to its synchronous
  ORM and request model; its strengths (admin, ORM, templating) are largely irrelevant to an
  agent-dispatch backend.
- **Node.js / Express** — natively async, but would split the codebase across two languages
  (Python for AI/ML, JS for the API), fragmenting the agent and tool code that must live in
  Python alongside the LLM/ML libraries.

#### Rationale
- **AI latency handling:** `async def` endpoints with cooperative scheduling let a small number
  of workers hold thousands of in-flight awaits on slow I/O without dedicating a thread to each —
  the only sane model when calls routinely block for 5–30 seconds.
- **Single-language cohesion:** agents, tools, NLP, and embeddings are all Python; keeping the
  API in the same language removes a serialization/marshalling seam and lets request handlers and
  agent code share types and utilities directly.
- **Scale:** async I/O multiplexing is what allows a 2-task baseline to absorb bursty,
  high-latency traffic and scale linearly with added tasks.
- **Contract clarity:** native Pydantic models and generated OpenAPI give a typed, self-describing
  contract that the frontend and n8n consume without drift.

#### Tradeoffs
- A leaner, less prescriptive framework: there is no built-in admin, ORM, or auth — the team
  assembles those pieces and owns the choices.
- Async correctness is the developer's responsibility; a single blocking call in a hot path
  silently degrades the whole event loop, so discipline around "never block the loop" is required.

#### Consequences
- **Positive:** the request tier stays responsive under high-latency load; the entire backend is
  one language and one mental model.
- **Negative:** every dependency in a request path must be async-compatible (this directly
  motivates ADR-003's async driver choice); blocking mistakes are easy to introduce and hard to
  spot.
- **Future constraint:** all future backend libraries (DB drivers, HTTP clients, queue clients)
  must be async or explicitly offloaded; sync-only dependencies are effectively disqualified from
  request paths.

---

### ADR-002: LangGraph for AI Agent Orchestration

#### Status
Accepted.

#### Context
Each intelligence service is not a single prompt but a *pipeline*: fetch data → run NLP → cluster
→ retrieve context → generate narrative → decide on alerts → persist. These steps have ordering,
shared intermediate state, and individual failure modes. Treating this as one giant prompt or an
opaque chain makes it impossible to test a step in isolation, see where a run failed, or reason
about partial progress.

#### Decision
Model every agent as a LangGraph `StateGraph` — explicit nodes (steps), explicit edges
(transitions), and a typed state object threaded through the graph.

#### Alternatives Considered
- **Raw LangChain chains (or a hand-rolled prompt sequence)** — simpler to start, but the control
  flow and intermediate state are implicit; debugging means re-running the whole chain, and
  branching (e.g., conditional alerting) becomes ad-hoc glue.
- **A bespoke async orchestration loop** — full control, but reinvents state management,
  transition handling, and—critically—the tracing integration, and becomes idiosyncratic
  tribal knowledge.
- **A general workflow engine (Temporal, AWS Step Functions)** — durable and powerful, but aimed
  at coarse-grained, long-horizon orchestration; overkill for second-scale in-process AI
  pipelines and a poor fit for the LLM-tracing tooling the system standardizes on.

#### Rationale
- **Observability pairing:** graph nodes map cleanly onto trace spans, so the orchestration model
  and the debugging model (ADR / LangSmith) are the same shape — input state → per-node execution
  → output state.
- **Testability:** because state transitions are explicit and each node is a pure-ish function of
  state, nodes are unit-tested in isolation before being wired into the graph, which is the only
  practical way to test non-deterministic AI steps.
- **Extensibility without re-architecture:** adding a capability (e.g., the RAG context step) is
  inserting a node and an edge, not rewriting the pipeline — this is what makes "extend, don't
  replace" feasible in practice.
- **Uniformity:** three different services share one orchestration shape, so operational and
  debugging knowledge transfers across all of them.

#### Tradeoffs
- Framework lock-in: the agents are expressed in LangGraph's abstractions; migrating away would
  mean rewriting orchestration.
- Ceremony cost: even a trivial linear flow pays the graph-construction overhead, which can feel
  heavy for the simplest pipelines.

#### Consequences
- **Positive:** pipelines are inspectable, resumable in principle, and independently testable per
  step; new analysis stages are additive.
- **Negative:** the team must keep current with a fast-moving framework; graph definitions are an
  additional artifact to maintain.
- **Future constraint:** new agent capability is expressed as nodes within the existing three
  graphs, not as competing orchestration mechanisms — preserving a single orchestration paradigm
  is itself a design invariant.

---

### ADR-003: PostgreSQL + pgvector as a Unified Data and Vector Store

#### Status
Accepted.

#### Context
The system stores two kinds of data that are tightly related: relational records (clients,
feedback, insights, signals, events) and vector embeddings for retrieval. These are queried
together — retrieval is always *tenant-scoped*, blending a client's own history with global
knowledge. Splitting them across two systems introduces a consistency seam exactly where
correctness and isolation matter most.

#### Decision
Use a single PostgreSQL instance with the pgvector extension as both the primary relational
store and the vector store.

#### Alternatives Considered
- **PostgreSQL + a dedicated vector database (Pinecone, Weaviate, Milvus)** — best-in-class ANN
  performance and scaling, but introduces a second datastore with its own auth, tenancy model,
  backup story, and a synchronization problem between relational rows and their embeddings.
- **A document database with native vector search (MongoDB Atlas Vector, etc.)** — consolidates
  storage, but abandons the relational guarantees, foreign keys, and—decisively—the row-level
  security model the tenancy strategy depends on (ADR-004).

#### Rationale
- **Isolation inheritance:** because embeddings live in the same database under the same tenancy
  mechanism, they inherit RLS and `client_id` scoping for free; a separate vector store would
  require re-implementing and re-auditing tenant isolation in a second system.
- **Transactional consistency:** an insight and its associated embedding can be written and read
  under the same transactional guarantees; there is no window where vectors and rows disagree.
- **Operational simplicity at scale:** one store means one backup/restore, one connection-pool
  story, one set of credentials, one place to reason about performance — a decisive advantage for
  a small team holding the line to 500 clients.
- **Locality of retrieval:** RAG queries that mix relational filters (tenant, time window) with
  vector similarity run in one query against one engine rather than a fan-out-and-join across
  services.

#### Tradeoffs
- **Recall/scale ceiling:** an ivfflat index trades some recall for speed and will not match a
  purpose-built ANN engine at very large vector volumes; index tuning is a future concern.
- **Shared resource budget:** vector search and OLTP traffic contend for the same instance's CPU,
  memory, and I/O, so a heavy retrieval workload can affect transactional latency and vice versa.

#### Consequences
- **Positive:** tenancy, consistency, and operations are unified; the vector layer cannot become a
  tenancy blind spot.
- **Negative:** vector performance is bounded by what one Postgres instance can do; scaling
  vectors and OLTP independently is not possible without revisiting this decision.
- **Future constraint:** if vector volume eventually outgrows pgvector, extracting it to a
  dedicated store would require re-solving tenant isolation in that store first — that cost is the
  price of today's simplicity and must be weighed at that time.

---

### ADR-004: Row-Level Security for Multi-Tenancy

#### Status
Accepted.

#### Context
Tenant isolation is the system's highest-stakes invariant (forcing function #3). The naive
approach — relying on every query to include the correct `WHERE client_id = …` — fails open: a
single forgotten predicate, an `OR`-precedence bug, or a new query written by someone unfamiliar
with the convention silently leaks one customer's competitive intelligence to another.

#### Decision
Enforce tenant isolation in the database via PostgreSQL Row-Level Security, with the active tenant
established per-connection through a session setting (`app.current_client_id`), and treat
application-layer `client_id` scoping as a *second*, redundant line of defense rather than the
primary one.

#### Alternatives Considered
- **Application-layer filtering only** — simplest and most flexible, but fails open: isolation is
  only as strong as the most careless query in the codebase, and there is no backstop.
- **Schema-per-tenant or database-per-tenant** — very strong isolation, but operationally
  punishing at 500 tenants: migrations must fan out across hundreds of schemas/databases,
  connection management multiplies, and cross-tenant platform analytics become awkward.

#### Rationale
- **Fails closed:** with RLS, a query that forgets its tenant predicate returns *nothing* (or only
  the active tenant's rows) instead of everything — the failure mode inverts from "leak" to
  "empty result," which is safe and immediately visible.
- **Lowest enforceable layer:** isolation lives adjacent to the data itself, so it holds
  regardless of which service, agent, or future code path issues the query.
- **Scales without per-tenant overhead:** one schema, one set of migrations, and a session
  variable — far cheaper to operate at hundreds of tenants than per-tenant schemas.
- **Defense in depth:** combined with explicit `client_id` predicates in agent SQL, two
  independent mechanisms must both fail for a leak to occur.

#### Tradeoffs
- **Connection discipline is mandatory:** RLS only protects connections where the session variable
  is set. Background and agent database connections that bypass the request middleware must still
  establish tenant context (or filter explicitly), or they operate outside the guarantee — a sharp
  edge that must be understood by everyone writing agent code.
- **Policy maintenance:** every tenant table needs its policy; adding a table means remembering to
  enable and police it.
- **Debuggability:** "why is this query returning nothing" can have an invisible cause (unset
  session context), which is a new class of confusion.

#### Consequences
- **Positive:** cross-tenant leakage requires *two* independent failures; the dangerous default
  (leak-on-omission) is eliminated.
- **Negative:** developers must internalize the session-context model, especially for non-request
  code paths; RLS adds a small per-query evaluation cost.
- **Future constraint:** any new data-access path — new agent, new worker, new analytics job — is
  obligated to establish tenant context before touching tenant tables; this is a permanent tax on
  every future feature and is accepted deliberately.

---

### ADR-005: Asynchronous Background-Task Processing for Agent Runs

#### Status
Accepted.

#### Context
An agent run takes 5–30 seconds. If the HTTP request that triggers it blocks until completion,
the client waits, the connection is held open, timeouts and retries pile up, and the request tier
saturates under concurrent runs — directly violating forcing functions #1 and #2.

#### Decision
Trigger endpoints enqueue agent work to run after the response is sent and return immediately with
an acknowledgment; results are persisted by the agent and read back through separate query
endpoints (and pushed via ADR-012).

#### Alternatives Considered
- **Synchronous in-request execution** — trivial to implement, but couples client-visible latency
  to LLM latency and collapses under concurrency; non-viable for this workload.
- **A dedicated external task broker / worker tier (Celery, RQ, Arq)** — durable, with retries,
  scheduling, and dead-letter handling, but adds a broker (e.g., Redis) and a separate worker
  deployment to operate — meaningful complexity for an MVP.
- **Serverless function per run (Lambda)** — elastic and isolated, but reintroduces cold-start
  latency, complicates the shared Python/agent codebase and tracing, and fragments the deployment
  model away from ADR-008.

#### Rationale
- **Decoupling:** separating "accept the work" from "do the work" lets the trigger respond in well
  under 100ms regardless of how long the agent takes, keeping the API responsive under load.
- **Right-sized for MVP:** in-process background execution avoids standing up and operating a
  broker before the platform's volume justifies it, while still achieving the essential decoupling.
- **Cohesion:** the work runs in the same process and language as the agents and tracing, so there
  is no marshalling boundary or second runtime to observe.

#### Tradeoffs
- **Weaker durability than a broker:** in-process background tasks do not survive a task/container
  restart, offer no built-in retry or backoff, and provide no dead-letter visibility — a run lost
  to a crash is simply lost until re-triggered.
- **Coupled scaling:** background work consumes the same task's resources as request handling, so a
  burst of agent runs competes with request latency on that instance.

#### Consequences
- **Positive:** trigger latency is decoupled from agent latency with minimal moving parts; the
  scheduled-trigger layer (ADR-006) re-runs work, which softens the durability gap.
- **Negative:** no strong delivery/retry guarantees for an individual run today.
- **Future constraint:** this is the most likely component to be revisited as volume grows.
  Migrating to a dedicated broker/worker tier is anticipated; designs should keep agent entry
  points broker-portable (idempotent, parameterized by `client_id`, no reliance on in-request
  state) so that migration is a substitution, not a rewrite.

---

### ADR-006: n8n for Workflow Orchestration

#### Status
Accepted.

#### Context
The platform needs scheduled and event-triggered orchestration around the agents: periodic
ingestion and analysis sweeps across all active clients, weekly report generation, and
threshold-driven alert delivery to Slack and email. Embedding this scheduling and fan-out logic
inside the application code would entangle "when and to whom" concerns with "what the system
computes," and would make operational changes (cadence, recipients, routing) require code deploys.

#### Decision
Use n8n as a separate orchestration/delivery layer that triggers FastAPI endpoints on schedules
and webhooks and handles outbound delivery — with a strict boundary: **n8n triggers and delivers;
FastAPI/LangGraph think.** n8n performs no analysis.

#### Alternatives Considered
- **Cron + scripts** — minimal, but opaque, hard to observe, and brittle; conditional routing and
  delivery integrations become bespoke scripting.
- **Apache Airflow** — powerful DAG scheduling, but heavy to operate and oriented to data-pipeline
  batch jobs rather than lightweight HTTP-triggering and notification delivery.
- **An in-application scheduler (APScheduler, Celery beat)** — keeps everything in one runtime, but
  pulls scheduling, fan-out, and third-party delivery back into the application code the decision
  is specifically trying to keep clean, and ties cadence changes to deploys.

#### Rationale
- **Separation of concerns:** orchestration and delivery are operational policy, not business
  logic; keeping them in n8n means the application exposes capabilities and n8n decides when to
  invoke them and where results go.
- **Operability:** workflows are visual, editable, and exportable as version-controlled JSON, so
  cadence and routing changes are reviewable artifacts rather than buried code.
- **Delivery isolation:** third-party delivery integrations (Slack, email) live at the edge, so
  their failures and rate limits don't destabilize the analysis core.

#### Tradeoffs
- **Another runtime to operate:** n8n is a stateful service (single instance with persistent
  storage) that must be deployed, secured, and backed up.
- **Boundary discipline required:** the value of this split evaporates if analysis logic creeps
  into n8n; preventing that creep is an ongoing governance cost.

#### Consequences
- **Positive:** the application stays focused on computing intelligence; operational schedules and
  routing evolve independently and visibly.
- **Negative:** a stateful orchestration service is a single-instance component (see ADR-008) and a
  potential operational chokepoint; its workflows are an additional artifact class to review.
- **Future constraint:** the contract between n8n and FastAPI is a set of stable endpoint paths;
  renaming or restructuring those endpoints obligates a coordinated workflow change, so the API
  surface n8n depends on is effectively a published interface.

---

### ADR-007: Next.js App Router for the Frontend

#### Status
Accepted.

#### Context
The client portal renders sensitive, tenant-scoped intelligence and must authenticate every data
access against the backend. The architectural question is not visual — it is *where data fetching
and the auth boundary live*: on the server, close to the token and the API, or in the browser.

#### Decision
Use Next.js with the App Router, rendering data-fetching pages as server components by default and
reserving client components for genuinely interactive or real-time surfaces.

#### Alternatives Considered
- **Next.js Pages Router** — proven, but its data-fetching model (`getServerSideProps`, etc.) is
  page-level and less composable than server components for a portal where most surfaces are
  server-rendered reads with islands of interactivity.
- **A pure client-side SPA (CRA/Vite + REST)** — simple mental model, but pushes all data fetching
  and token handling into the browser, enlarging the surface where tokens and tenant data are
  exposed and adding client-side waterfalls.

#### Rationale
- **Auth/data boundary on the server:** server components fetch tenant data server-side, so access
  tokens and raw payloads need not be exposed to or assembled in the browser, shrinking the
  client-side attack surface for sensitive intelligence.
- **Fewer round-trips:** rendering reads on the server collapses client-side request waterfalls and
  delivers data-dense pages without a chain of browser fetches.
- **Streaming and composition:** the server-component model composes server-rendered reads with
  client islands (real-time, dialogs) cleanly, matching a portal that is mostly reads with focused
  interactive zones.

#### Tradeoffs
- **Conceptual complexity:** the server/client component boundary is a real source of bugs and
  confusion (what runs where, what can use hooks, how data crosses the boundary).
- **Framework coupling:** the App Router's conventions are opinionated and evolving.

#### Consequences
- **Positive:** the default rendering path keeps tokens and tenant data server-side and reduces
  client round-trips.
- **Negative:** developers must reason explicitly about the server/client split; missteps surface
  as hydration or "can't use this on the server" errors.
- **Future constraint:** new portal surfaces default to server components and justify any move to
  client-side fetching — the server-first posture is the standing default, not a per-page coin flip.

---

### ADR-008: Docker + AWS ECS Fargate for Deployment

#### Status
Accepted.

#### Context
The system is several distinct runtimes (API, frontend, orchestration, database) that must deploy
reproducibly and scale to absorb bursty, high-latency agent traffic at 500 clients — without a
dedicated platform/SRE team to run the infrastructure.

#### Decision
Containerize each service (one container per service) and run them on AWS ECS Fargate, with
autoscaling on the stateless backend, fronted by an application load balancer and CDN, backed by
managed data services.

#### Alternatives Considered
- **EKS / self-managed Kubernetes** — maximal flexibility and portability, but a large operational
  surface (control plane, networking, upgrades) that a small team would pay for continuously
  without needing most of its power.
- **Raw EC2 (VMs + a process manager)** — full control and low abstraction, but reproducibility,
  scaling, and rollout become hand-built and error-prone.
- **All-serverless (Lambda for the API)** — elastic and operations-light, but reintroduces cold
  starts on a latency-sensitive workload, fragments the shared Python runtime, and complicates
  long-lived connections (ADR-012).

#### Rationale
- **Scale mandate with low ops tax:** Fargate autoscaling on a stateless backend (scaling out as
  load rises) meets the 100→500-client requirement without operating a Kubernetes control plane.
- **Reproducibility:** containers make each service's runtime identical across local and
  production, eliminating environment drift.
- **Ecosystem cohesion:** ECS composes naturally with the managed data tier, object storage,
  container registry, secret storage, and centralized logging, giving one coherent operational
  picture.

#### Tradeoffs
- **Less control and portability than Kubernetes:** ECS/Fargate is more opinionated and AWS-shaped;
  some advanced scheduling and ecosystem tooling is unavailable or different.
- **Cloud coupling:** the deployment model is bound to AWS primitives; moving clouds would be a
  meaningful project.

#### Consequences
- **Positive:** reproducible, autoscaling deployment with a small operational footprint; the
  stateless services scale horizontally on demand.
- **Negative:** stateful components are the exception that breaks the pattern — the orchestration
  layer (ADR-006) runs as a single task with persistent storage and cannot simply be scaled out,
  making it a deliberate single point that must be operated with care.
- **Future constraint:** new services are expected to be stateless and container-per-service to
  inherit autoscaling; any new stateful service inherits the same "single-task, persistent
  storage" caveat and must justify it.

---

### ADR-009: MCP Tool Layer for External Integrations

#### Status
Accepted.

#### Context
Agents must reach a large and growing set of third-party sources (support tools, survey tools,
analytics, review sites, news, job boards), each with distinct authentication, payload shapes, and
failure behavior, and each connected per-client with per-client credentials. If agents called these
APIs directly, integration churn and credential handling would be smeared across agent logic, and
every new source would mean editing the agents.

#### Decision
Place all external integrations behind a uniform tool abstraction (Model Context Protocol–style
tools): each integration is a self-describing tool with a typed input schema, registered centrally
and resolved per-client based on what that client has connected. Agents invoke tools; they never
call vendor APIs directly.

#### Alternatives Considered
- **Bespoke API clients per integration, called inline in agents** — direct and obvious, but
  couples each agent to the specifics of each vendor and scatters credential logic and
  normalization throughout the pipeline code.
- **Direct vendor-SDK calls inside agent nodes** — fast to write for one source, but turns every
  integration change into an agent change and makes per-client tool availability impossible to
  manage cleanly.

#### Rationale
- **Containment of churn:** the volatility of third-party APIs is quarantined inside tools; when a
  vendor changes, exactly one tool changes and the agents are untouched.
- **Uniform invocation:** "define once, call from any agent" means a new agent automatically gains
  access to the existing connector catalog through a single registry.
- **Per-client safety:** tools resolve dynamically to only the sources a client has connected, and
  credential decryption/handling is isolated inside the tool boundary rather than in agent logic —
  which also keeps the tenancy and secret-handling story localized.
- **Scale of breadth:** a uniform boundary is what makes a catalog of hundreds of connectors
  tractable rather than hundreds of ad-hoc code paths.

#### Tradeoffs
- **Abstraction overhead:** every integration must be expressed in the tool contract and produce
  normalized output, which is more upfront work than a one-off API call.
- **Normalization burden:** mapping heterogeneous vendor payloads into a consistent shape is
  ongoing work and a place where subtle data-fidelity bugs can hide.

#### Consequences
- **Positive:** integrations are swappable and additive without touching agents; credential
  handling and per-client tool resolution are centralized.
- **Negative:** the tool/normalization layer is itself a body of code to maintain and test against
  shifting external contracts.
- **Future constraint:** every new external source is added as a tool and registry entry — direct,
  inline vendor calls inside agents are disallowed by construction, which is what keeps the agents
  stable as the connector catalog grows.

---

### ADR-010: RAG via a Central Embedding Service

#### Status
Accepted.

#### Context
Agent narratives must be grounded in prior context — a client's earlier analyses, industry
benchmarks, and playbook guidance — and that retrieval is always tenant-aware (a client's own
knowledge plus shared global knowledge). If each agent embedded and retrieved on its own, the
system would risk multiple embedding models, inconsistent vector dimensions, and divergent
retrieval semantics, making results incomparable and the knowledge base internally inconsistent.

#### Decision
Funnel all embedding and retrieval through one central embedding service that owns the single
embedding model and the single retrieval path; agents request context through it rather than
embedding or querying vectors themselves.

#### Alternatives Considered
- **Per-agent, ad-hoc retrieval** — lets each agent optimize for its own needs, but invites
  multiple models and query patterns, dimensional drift in the shared vector column, and
  duplicated, subtly inconsistent code.
- **An external managed RAG/retrieval service** — offloads the machinery, but adds a third-party
  dependency, moves tenant data and embeddings outside the unified store (conflicting with
  ADR-003/ADR-004), and re-creates the isolation problem elsewhere.

#### Rationale
- **Consistency by construction:** one model and one dimensionality mean every vector in the store
  is comparable; there is no risk of mixing incompatible embeddings.
- **One retrieval semantic:** tenant + global blending, similarity ordering, and top-k behavior are
  defined once, so every agent's grounding behaves identically and predictably.
- **Explainability:** because all grounding flows through one path, every narrative can be traced
  back to the specific retrieved context that informed it — grounding becomes auditable rather than
  ad-hoc.
- **DRY and isolation:** centralizing retrieval keeps the tenancy-aware query in one reviewed place
  rather than re-implemented (and re-bugged) per agent.

#### Tradeoffs
- **Shared dependency / potential bottleneck:** every agent depends on this one service; its
  performance and availability bound all grounding, and it is a single place that, if slow, slows
  everyone.
- **One model for all use cases:** a single embedding model cannot be locally optimized for one
  agent's domain without affecting the others.

#### Consequences
- **Positive:** vectors are consistent, retrieval is uniform, and every insight is explainable via
  the context it retrieved.
- **Negative:** the embedding service is a shared chokepoint and a model-choice commitment that
  applies system-wide.
- **Future constraint:** changing the embedding model is a global migration (existing vectors must
  be re-embedded to remain comparable), so the model choice carries long-term inertia and must be
  treated as a deliberate, versioned decision.

---

### ADR-011: JWT-Based Authentication

#### Status
Accepted — with a documented open question (see Rationale/Consequences).

#### Context
The backend scales horizontally across multiple stateless tasks behind a load balancer (ADR-008),
and the tenant-isolation model (ADR-004) needs the active `client_id` available at the start of
every request to set the database session context. The auth mechanism must therefore make identity
*and* tenant available on every request without assuming server-side affinity or shared session
state.

#### Decision
Use stateless JSON Web Tokens that carry the user identity and `client_id` as claims; each request
is authenticated by verifying the token, and the tenant claim feeds directly into the RLS session
context.

#### Alternatives Considered
- **Server-side sessions (session store + cookie)** — simple and easily revocable, but requires a
  shared session store that every task can reach, reintroducing shared state into an otherwise
  stateless tier and a dependency to operate and scale.
- **A managed identity provider as the sole auth system** — offloads credential handling and user
  management, but makes the system depend on an external service for a core security boundary and
  must still surface the tenant claim into the backend's request/RLS context.

#### Rationale
- **Fits stateless scaling:** any task can validate a token independently with no shared session
  store, so the backend scales out cleanly behind the load balancer.
- **Feeds tenancy directly:** carrying `client_id` in the token means the RLS session context can
  be established immediately on each request from a verified source, tying auth and isolation
  together by design.
- **No affinity required:** stateless verification means no sticky sessions and no coordination
  between tasks.

#### Tradeoffs
- **Revocation is hard:** a stateless token is valid until it expires; immediate invalidation
  (logout-everywhere, compromised token) requires extra machinery (short lifetimes, denylists,
  rotation) that a session store would give for free.
- **Secret management is critical:** the signing secret is a system-wide trust root; its compromise
  is catastrophic, raising the stakes on secret storage and rotation.

#### Rationale note — the open architectural question
The two source documents disagree on the authentication mechanism: one names a managed identity
provider, the other specifies a self-hosted JWT scheme (with a user/credential store). This is an
unresolved architectural decision, not a settled one. The accepted position here is the stateless
JWT model because it most directly satisfies the stateless-scaling and RLS-context forces above and
because the supporting data model for it already exists; a managed provider could still front user
management while the backend continues to consume a tenant-bearing token. **This conflict should be
resolved explicitly by a maintainer before authentication is hardened, and the two mechanisms
should not be partially mixed without a decision.**

#### Consequences
- **Positive:** auth imposes no shared state on the request tier and hands tenancy straight to the
  isolation layer.
- **Negative:** the system inherits JWT's revocation weakness and a high-value signing secret;
  until the open question is resolved, auth carries documented ambiguity.
- **Future constraint:** token lifetime, rotation, and any revocation strategy are now permanent
  operational responsibilities; whichever way the open question is resolved, the backend's reliance
  on a verified tenant claim per request is the fixed point that must be preserved.

---

### ADR-012: Server-Sent Events for Real-Time Updates

#### Status
Accepted.

#### Context
Because agent work is asynchronous (ADR-005), results appear *after* the triggering request has
returned. The portal needs to learn "a new insight is ready" and update without the user
refreshing. The data flow is fundamentally one-directional: the server has news for the client; the
client has nothing to stream back over the same channel.

#### Decision
Push updates from server to client using Server-Sent Events over a long-lived HTTP response; the
client subscribes and reacts to events as agents complete.

#### Alternatives Considered
- **WebSockets** — full bidirectional, real-time channel, but heavier: a separate protocol with its
  own connection lifecycle and load-balancer handling, providing duplex capability the notification
  use case does not need.
- **Client polling** — trivial to implement, but generates constant request load that scales with
  clients × poll frequency (directly antagonistic to forcing function #2) and trades latency
  against wasted work.

#### Rationale
- **Matches the data direction:** the workload is server→client notification; SSE provides exactly
  that over ordinary HTTP, with no second protocol to operate.
- **Avoids polling load:** a subscription replaces a stream of polling requests, removing load that
  would otherwise grow with the tenant count.
- **Operational simplicity:** SSE rides the existing HTTP/load-balancer path, avoiding the extra
  handling a WebSocket upgrade demands across the proxy/CDN tier.

#### Tradeoffs
- **Unidirectional only:** any future need for rich client→server real-time interaction would
  outgrow SSE and require WebSockets.
- **Long-lived connections:** holding open connections consumes server resources and must be
  managed across autoscaling and reconnection.

#### Consequences
- **Positive:** the dashboard updates in near-real-time on agent completion without polling load or
  a second protocol.
- **Negative:** the current detection mechanism (a periodic server-side check feeding the stream)
  is an interim, poll-on-the-server approach whose latency and database cost should be revisited;
  it is acceptable for MVP but is not the long-term notification substrate.
- **Future constraint:** if event volume or the server-side check's cost grows, the trigger for
  pushes should move from periodic checking to an event/notification mechanism (e.g., emitting on
  persistence) rather than abandoning SSE; bidirectional needs, if they ever arise, are the only
  reason to reconsider the transport itself.

---

## 4. CROSS-CUTTING ARCHITECTURAL THEMES

These principles recur across the ADRs above; they are the "why" behind multiple decisions at once.

### 4.1 AI agents are stateful graphs, not stateless calls
A single LLM call is opaque: it either works or doesn't, and a multi-step task hidden inside one
prompt cannot be inspected, tested in pieces, or resumed. Modeling agents as stateful graphs makes
the *steps* the unit of reasoning — each is independently testable, each maps to a trace span, and
intermediate state is explicit. For a workload where output is non-deterministic and must be
debugged in production, this inspectability is worth the framework weight. (Drives ADR-002, enables
ADR-005's testability and ADR-010's insertion of a retrieval step.)

### 4.2 Ingestion is decoupled from analysis
Raw data arrives on the schedule of external sources and clients; analysis runs on the system's
schedule and budget. Binding them would let a slow or bursty source stall analysis, or a slow
analysis back up ingestion. Keeping them separate — data lands first, analysis sweeps it later, with
an explicit "processed" boundary marking the handoff — lets each scale and fail independently and
gives natural backpressure: unprocessed work simply accumulates and is drained, rather than
overwhelming the analysis tier in real time. (Drives the separation between ADR-006's ingestion
orchestration and ADR-005's analysis execution.)

### 4.3 Async-first is a system property, not a local optimization
The 5–30s latency of AI work is the single most influential fact about this system. It is the
reason the backend is async (ADR-001), the reason analysis is backgrounded (ADR-005), the reason
the database driver must be async, and the reason real-time delivery is push-based (ADR-012).
"Async-first" is therefore not a coding style preference — it is a property the whole architecture
is organized around, and any synchronous, blocking component in a hot path is an architectural
defect, not merely a slow one.

### 4.4 The system is event-driven via orchestration and webhooks
Rather than a monolith that schedules and notifies itself, the system exposes capabilities and lets
an external orchestration layer decide *when* to invoke them and *where* results go, with webhooks
carrying threshold events outward to delivery. This loose coupling means cadence, routing, and
delivery evolve without touching the analysis core, and the failure of a delivery integration is
contained at the edge. (Drives ADR-006; complements ADR-005 by providing the re-trigger mechanism
that softens in-process durability gaps.)

### 4.5 The interpretation layer is a first-class architectural concern
The system's defining output is not data but *interpretation* — narratives, strategic context,
prioritized recommendations. Architecturally, this means interpreted artifacts are persisted as
first-class records alongside the raw inputs, and that grounding those interpretations (so they are
explainable and consistent) is itself a piece of infrastructure (ADR-010), not a prompt-engineering
detail. Treating interpretation as a stored, grounded, auditable product — rather than a transient
formatting step on top of analytics — is why RAG and the narrative-bearing records exist at the
architecture level at all.

### 4.6 Tenancy is enforced at the data layer, not the application layer alone
Application-layer isolation fails open: it is only as strong as the most careless query. Pushing
the boundary down to the database (ADR-004) inverts the default so that omission yields *no data*
rather than *all data*, and keeping relational and vector data in one tenancy-governed store
(ADR-003) means no data category sits outside that boundary. Isolation is thus treated as an
invariant guaranteed by the layer closest to the data, with application scoping as redundancy — two
independent failures required for a leak.

---

## 5. ARCHITECTURE DIAGRAM (TEXTUAL)

The reasoning-level flow of the system. Each stage is annotated with *why it exists* and *which
forcing function it answers*, not how it is implemented.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL DATA SOURCES (support, surveys, analytics, reviews, news, …)     │
│  WHY: the intelligence is only as good as the breadth of inputs.           │
│  FORCE: heterogeneous, unstable sources (#4).                              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  (pulled on a schedule / by event)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION LAYER (n8n)                                                 │
│  WHY: decide WHEN to act and WHERE results go, kept out of app logic.      │
│  ROLE: triggers ingestion + analysis sweeps; routes alerts/reports.        │
│  FORCE: operability + loose coupling; event-driven (#5).  [ADR-006]        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  (HTTP triggers / webhooks — stable contract)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  APPLICATION TIER (FastAPI)                                                │
│  WHY: async dispatch + auth/tenancy boundary; the system's "brain stem."   │
│  ROLE: authenticate (carry tenant claim), set tenant context, ACCEPT work  │
│        fast and hand it to background execution — never block on the run.  │
│  FORCE: AI latency (#1), scale (#2), isolation (#3).  [ADR-001/005/011/004]│
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  (background dispatch — decoupled from request)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  AGENT TIER (LangGraph stateful graphs)                                    │
│  WHY: multi-step AI work that must be inspectable, testable, traceable.    │
│  ROLE: fetch → analyze → ground (RAG) → interpret → decide → persist,      │
│        reaching external sources only through the MCP tool boundary.       │
│  FORCE: AI latency (#1), observability (#5), source churn (#4).            │
│         [ADR-002, ADR-009]                                                 │
└──────────────┬───────────────────────────────────────┬───────────────────┘
               │  (tenant-scoped reads/writes)          │  (grounding lookups)
               ▼                                        ▼
┌─────────────────────────────────────┐   ┌────────────────────────────────┐
│  UNIFIED STORE (PostgreSQL+pgvector) │   │  RAG / EMBEDDING SERVICE        │
│  WHY: relational + vector in one     │◄──┤  WHY: one model, one retrieval  │
│  tenancy-governed store; isolation   │   │  path → consistent, explainable │
│  inherited by ALL data incl. vectors.│   │  grounding for every narrative. │
│  FORCE: isolation (#3), consistency, │   │  FORCE: explainability (#5).    │
│  simplicity at scale (#2).           │   │  [ADR-010]                      │
│  [ADR-003, ADR-004]                  │   └────────────────────────────────┘
└──────────────┬───────────────────────┘
               │  (interpreted insights persisted as first-class records)
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION (Next.js, server-first)  +  PUSH (SSE)                       │
│  WHY: fetch sensitive data server-side; notify the client on completion    │
│       without polling load.                                                │
│  FORCE: data-exposure surface, scale (#2), async result timing (#1).       │
│         [ADR-007, ADR-012]                                                 │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  (threshold events flow back out)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ALERTS / DELIVERY (via orchestration → Slack, email)                      │
│  WHY: deliver time-sensitive findings at the edge; failures contained.     │
│  FORCE: loose coupling, delivery isolation (#5).  [ADR-006]                │
└──────────────────────────────────────────────────────────────────────────┘

ALL TIERS run as containers on autoscaling, stateless compute (one stateful
exception: the orchestration layer). WHY: meet the 500-client mandate with a
small operational footprint. FORCE: scale (#2).  [ADR-008]
```

Read as a sentence: *external data is pulled in by orchestration, accepted quickly and
tenant-scoped by the application tier, processed asynchronously by inspectable agent graphs that
reach the outside world only through a uniform tool boundary and ground their output through a
single retrieval path, persisted as interpreted records in one tenancy-governed store, surfaced
server-first and pushed to clients on completion, with time-sensitive findings delivered back out
at the edge — all on stateless, autoscaling compute.*

---

## 6. DESIGN PRINCIPLES SUMMARY

These are the immutable, quotable principles the architecture is built to uphold. They are the
compression of every ADR above; a change request that violates one of these is an architectural
change, not a feature.

- **AI is the core execution engine, not a feature layer.** The unit of work is an AI computation;
  the rest of the system exists to feed, run, isolate, ground, and surface it.
- **No cross-tenant data leakage is architecturally impossible, not merely prevented.** Isolation
  lives at the data layer and fails closed; application scoping is redundancy, so a single mistake
  cannot leak.
- **Every long-running process is async by construction.** AI latency is a structural constraint;
  any blocking call in a hot path is a defect, not a slowdown.
- **All external integrations pass through the MCP abstraction.** Vendor churn is quarantined behind
  a uniform tool boundary; agents never touch a vendor API directly.
- **Every insight is explainable via retrieved RAG context.** Grounding flows through one service
  and one model, so any narrative can be traced to the context that produced it.
- **State lives in the data tier; compute is stateless and horizontally scalable.** The application
  and agent tiers hold no durable state, so they scale out freely to meet the 500-client mandate.
- **Orchestration decides *when* and *where*; the application decides *what*.** Scheduling and
  delivery never leak into analysis logic, and analysis logic never leaks into orchestration.
- **Observability is a precondition, not an add-on.** Non-deterministic AI work is only operable if
  every run is traced and every data access is auditable.
- **Extend the three agents; do not add a fourth architecture.** New capability is a node or a tool,
  preserving one orchestration paradigm and one operational model.

---

*DataAutomated.io — ARCHITECTURE_DECISION_RECORDS.md v1.0 | June 2026 | Confidential — Engineering
Use Only. Companion to CLAUDE.md: this document records why; CLAUDE.md records what and how.*
