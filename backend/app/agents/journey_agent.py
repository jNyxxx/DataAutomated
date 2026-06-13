"""
Behavioral Journey agent (CLAUDE.md §7.3; AGENT_ARCHITECTURE.md §3.3).

Graph: fetch_events -> define_funnels -> calculate_dropoffs
       -> diagnose_friction -> rag_context -> generate_recommendations -> store -> END

Phase 4c scope: fully functional. Unlike the Competitive Signal agent, this agent has NO
Phase 5 dependency — it reads behavioral events directly from the `journey_events` table
(those rows are *populated* by P5 ingestion tools, but the analysis runs on whatever is
already present). Funnel reconstruction and drop-off math are deterministic; only friction
diagnosis and recommendation phrasing use the LLM.

Phase 7 (RAG): rag_context_node retrieves relevant knowledge-base chunks (playbooks,
industry benchmarks for friction patterns) before generate_recommendations_node so the
LLM can ground recommendations in historical data.  Uses the central embedding_service
(CLAUDE.md §9).

Tenant contract (CLAUDE §6; MULTI_TENANT_SECURITY §4):
  - All DB access goes through acquire_for_client() — never asyncpg.connect().
  - Every query also carries WHERE client_id = $1 (belt-and-suspenders).
  - client_id is always an explicit argument; never inferred or defaulted.

Injection hardening (AUD-11/RISK-05): funnel statistics (not raw user content) are sent to
the LLM; output is schema-validated; invalid output falls back to safe defaults that never
trip the journey_insights.friction_cause CHECK constraint.

Observability (NFR-03): entry point is @traceable so every run appears in LangSmith.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, TypedDict
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langsmith import traceable
from pydantic import BaseModel, Field, ValidationError

from app.config import settings
from app.database import acquire_for_client
from app.services.audit_service import record_audit
from app.services.embedding_service import retrieve_similar
from app.services.llm_json import loads_tolerant

logger = logging.getLogger("dataautomated")

# Allowed friction causes — MUST match journey_insights_friction_cause_check (migration 0001).
_VALID_FRICTION = ("ux_friction", "messaging", "expectation")

# Drop-off below this is not "material" enough to diagnose (keeps LLM cost down — RISK-03).
_MATERIAL_DROPOFF = 0.1
# Cap funnel breadth so a noisy event stream can't explode the graph (NFR-04 / 500 clients).
_MAX_FUNNEL_STEPS = 10
# Bound the per-run event pull.
_EVENT_FETCH_LIMIT = 10000


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class JourneyState(TypedDict):
    client_id: UUID
    journey_events: list[dict]        # {session_id, user_id, event_type, occurred_at}
    funnel_steps: list[dict]          # {step, event_type, count}
    drop_off_analysis: list[dict]     # {funnel_step, event_type, entries, exits, drop_off_rate}
    friction_diagnosis: list[dict]    # {funnel_step, drop_off_rate, friction_cause, friction_score}
    rag_context: list[str]            # retrieved knowledge-base chunks (§9)
    recommendations: list[dict]       # diagnosis + {recommendation, projected_lift}
    narrative: str


# ---------------------------------------------------------------------------
# LLM output schema (friction diagnosis)
# ---------------------------------------------------------------------------

class FrictionDiagnosis(BaseModel):
    friction_cause: Literal["ux_friction", "messaging", "expectation"]
    friction_score: float = Field(ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_event_map(events: list[dict]) -> dict[str, set]:
    """Map each session_id -> set of event_types it contains."""
    sessions: dict[str, set] = {}
    for e in events:
        sid = e.get("session_id")
        et = e.get("event_type")
        if sid is None or et is None:
            continue
        sessions.setdefault(sid, set()).add(et)
    return sessions


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

async def fetch_events_node(state: JourneyState) -> dict:
    """Fetch the client's behavioral events, oldest first."""
    async with acquire_for_client(state["client_id"]) as conn:
        rows = await conn.fetch(
            "SELECT session_id, user_id, event_type, occurred_at "
            "FROM journey_events "
            "WHERE client_id = $1 "
            "ORDER BY occurred_at ASC NULLS LAST LIMIT $2",
            state["client_id"],
            _EVENT_FETCH_LIMIT,
        )
    events = [dict(r) for r in rows]
    logger.info(
        '{"event": "journey.fetch", "client_id": "%s", "count": %d}',
        state["client_id"],
        len(events),
    )
    return {"journey_events": events}


def define_funnels_node(state: JourneyState) -> dict:
    """
    Reconstruct a funnel from the event stream.

    Order: event types are ordered by earliest occurrence (the type that first appears
    chronologically is step 1). count = number of distinct sessions containing that type.
    Capped at _MAX_FUNNEL_STEPS.
    """
    events = state["journey_events"]
    if not events:
        return {"funnel_steps": []}

    first_seen: dict[str, Any] = {}
    sessions_by_type: dict[str, set] = {}
    for idx, e in enumerate(events):  # events already ordered oldest-first
        et = e.get("event_type")
        if et is None:
            continue
        # `events` is sorted by occurred_at ASC, so the first index wins as "first seen".
        if et not in first_seen:
            first_seen[et] = idx
        sid = e.get("session_id")
        if sid is not None:
            sessions_by_type.setdefault(et, set()).add(sid)

    ordered_types = sorted(first_seen.keys(), key=lambda t: first_seen[t])[:_MAX_FUNNEL_STEPS]
    funnel_steps = [
        {"step": i + 1, "event_type": et, "count": len(sessions_by_type.get(et, set()))}
        for i, et in enumerate(ordered_types)
    ]
    return {"funnel_steps": funnel_steps}


def calculate_dropoffs_node(state: JourneyState) -> dict:
    """Compute per-step drop-off rate between consecutive funnel steps (session-based)."""
    steps = state["funnel_steps"]
    if len(steps) < 2:
        return {"drop_off_analysis": []}

    sessions = _session_event_map(state["journey_events"])
    analysis: list[dict] = []
    for i in range(len(steps) - 1):
        cur_type = steps[i]["event_type"]
        next_type = steps[i + 1]["event_type"]
        at_cur = {sid for sid, types in sessions.items() if cur_type in types}
        continued = {sid for sid in at_cur if next_type in sessions[sid]}
        entries = len(at_cur)
        exits = entries - len(continued)
        rate = (exits / entries) if entries > 0 else 0.0
        analysis.append({
            "funnel_step": f"{cur_type} -> {next_type}",
            "event_type": cur_type,
            "entries": entries,
            "exits": exits,
            "drop_off_rate": round(rate, 4),
        })
    return {"drop_off_analysis": analysis}


async def diagnose_friction_node(state: JourneyState, llm: Any) -> dict:
    """Diagnose friction cause + score for steps with material drop-off. One LLM call."""
    material = [d for d in state["drop_off_analysis"] if d["drop_off_rate"] > _MATERIAL_DROPOFF]
    if not material:
        return {"friction_diagnosis": []}

    blocks = [
        f"[STEP {i + 1}] transition={d['funnel_step']} "
        f"drop_off_rate={d['drop_off_rate']} entries={d['entries']} exits={d['exits']}"
        for i, d in enumerate(material)
    ]
    system_msg = (
        "You are a UX and conversion analyst. For each funnel step with drop-off, diagnose "
        "the most likely friction cause. Base your answer ONLY on the provided statistics."
    )
    user_msg = (
        f"Diagnose these {len(material)} funnel drop-off points:\n\n"
        + "\n".join(blocks)
        + f"\n\nReturn a JSON array of exactly {len(material)} objects in order. Each object: "
        "friction_cause (one of: ux_friction, messaging, expectation), "
        "friction_score (float 0.0 to 1.0). Return ONLY the JSON array."
    )

    parsed: list = []
    try:
        response = await llm.ainvoke([SystemMessage(content=system_msg), HumanMessage(content=user_msg)])
        raw = response.content if hasattr(response, "content") else str(response)
        loaded = loads_tolerant(raw)
        if isinstance(loaded, list):
            parsed = loaded
    except Exception as exc:  # noqa: BLE001
        logger.warning("journey diagnose: LLM/parse failed (%s); defaulting all items", exc)

    diagnosis: list[dict] = []
    for i, d in enumerate(material):
        cause, score = "ux_friction", d["drop_off_rate"]
        if i < len(parsed):
            try:
                fd = FrictionDiagnosis(**parsed[i])
                cause, score = fd.friction_cause, fd.friction_score
            except (ValidationError, TypeError) as exc:
                logger.warning("journey diagnose: item %d invalid (%s); safe default", i, exc)
        diagnosis.append({
            "funnel_step": d["funnel_step"],
            "drop_off_rate": d["drop_off_rate"],
            "friction_cause": cause if cause in _VALID_FRICTION else "ux_friction",
            "friction_score": max(0.0, min(1.0, float(score))),
        })
    return {"friction_diagnosis": diagnosis}


async def rag_context_node(state: JourneyState) -> dict:
    """Retrieve relevant playbooks and benchmarks before generating recommendations (CLAUDE.md §9)."""
    diagnosis = state["friction_diagnosis"]
    if not diagnosis:
        return {"rag_context": []}

    causes = list({d.get("friction_cause", "") for d in diagnosis if d.get("friction_cause")})
    steps = [d.get("funnel_step", "") for d in diagnosis[:3]]
    query = (
        f"Funnel friction patterns: {', '.join(causes)}, "
        f"steps: {', '.join(steps)}"
    )
    try:
        similar = await retrieve_similar(query, client_id=state["client_id"], top_k=5)
        context = [r["content"] for r in similar]
        logger.info(
            '{"event": "journey.rag_context", "client_id": "%s", "chunks": %d}',
            state["client_id"],
            len(context),
        )
        return {"rag_context": context}
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            '{"event": "journey.rag_context_failed", "client_id": "%s", "error": "%s"}',
            state["client_id"],
            str(exc),
        )
        return {"rag_context": []}


async def generate_recommendations_node(state: JourneyState, llm: Any) -> dict:
    """Generate a recommendation + projected lift per friction point, plus a CEO narrative."""
    diagnosis = state["friction_diagnosis"]
    if not diagnosis:
        return {
            "recommendations": [],
            "narrative": "No material funnel friction detected for this period.",
        }

    blocks = [
        f"[FRICTION {i + 1}] step={d['funnel_step']} cause={d['friction_cause']} "
        f"drop_off_rate={d['drop_off_rate']}"
        for i, d in enumerate(diagnosis)
    ]
    system_msg = (
        "You are a growth strategist. For each diagnosed friction point, recommend a concrete "
        "fix and estimate the conversion lift if resolved. Also write a short executive "
        "narrative. Base everything ONLY on the provided data."
    )
    rag_ctx = state.get("rag_context", [])
    rag_section = ""
    if rag_ctx:
        rag_section = (
            "\n\nRelevant playbooks and industry benchmarks:\n"
            + "\n".join(f"  - {c}" for c in rag_ctx)
            + "\n"
        )
    user_msg = (
        f"Address these {len(diagnosis)} friction points:\n\n"
        + "\n".join(blocks)
        + rag_section
        + "\n\nReturn ONLY a JSON object with two keys: "
        f'"recommendations" (array of exactly {len(diagnosis)} objects in order, each with '
        '"recommendation" (string) and "projected_lift" (float 0.0 to 1.0)), and '
        '"narrative" (a 1-2 paragraph string).'
    )

    recs_raw: list = []
    narrative = ""
    try:
        response = await llm.ainvoke([SystemMessage(content=system_msg), HumanMessage(content=user_msg)])
        raw = response.content if hasattr(response, "content") else str(response)
        loaded = loads_tolerant(raw)
        if isinstance(loaded, dict):
            recs_raw = loaded.get("recommendations", []) or []
            narrative = loaded.get("narrative", "") or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("journey recommend: LLM/parse failed (%s); using fallbacks", exc)

    recommendations: list[dict] = []
    for i, d in enumerate(diagnosis):
        rec_text = None
        lift = round(d["drop_off_rate"] * 0.3, 4)  # conservative fallback
        if i < len(recs_raw) and isinstance(recs_raw[i], dict):
            r = recs_raw[i]
            if isinstance(r.get("recommendation"), str):
                rec_text = r["recommendation"]
            try:
                lift = max(0.0, min(1.0, float(r.get("projected_lift", lift))))
            except (TypeError, ValueError):
                pass
        if not rec_text:
            rec_text = (
                f"Address {d['friction_cause']} at '{d['funnel_step']}' "
                f"(drop-off {d['drop_off_rate']:.0%})."
            )
        merged = dict(d)
        merged["recommendation"] = rec_text
        merged["projected_lift"] = lift
        recommendations.append(merged)

    if not narrative:
        narrative = (
            f"Identified {len(recommendations)} material friction point(s) in the funnel; "
            "see per-step recommendations."
        )
    return {"recommendations": recommendations, "narrative": narrative}


async def store_node(state: JourneyState) -> dict:
    """Persist one journey_insights row per friction point. Single tenant-scoped transaction."""
    recommendations = state["recommendations"]
    if not recommendations:
        return {}

    async with acquire_for_client(state["client_id"]) as conn:
        for rec in recommendations:
            cause = rec.get("friction_cause")
            if cause not in _VALID_FRICTION:
                cause = "ux_friction"
            await conn.execute(
                "INSERT INTO journey_insights "
                "(client_id, funnel_step, drop_off_rate, friction_score, "
                " friction_cause, recommendation, projected_lift) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7)",
                state["client_id"],
                rec.get("funnel_step"),
                rec.get("drop_off_rate"),
                rec.get("friction_score"),
                cause,
                rec.get("recommendation"),
                rec.get("projected_lift"),
            )

    logger.info(
        '{"event": "journey.stored", "client_id": "%s", "count": %d}',
        state["client_id"],
        len(recommendations),
    )
    await record_audit(
        "agent.store",
        client_id=state["client_id"],
        actor="journey_agent",
        resource="journey_insights",
        detail={"count": len(recommendations)},
    )
    return {}


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def _build_journey_graph(llm: Any):
    """Build and compile the Journey StateGraph, closing the LLM into LLM-dependent nodes."""

    async def _diagnose(state: JourneyState) -> dict:
        return await diagnose_friction_node(state, llm)

    async def _recommend(state: JourneyState) -> dict:
        return await generate_recommendations_node(state, llm)

    workflow: StateGraph = StateGraph(JourneyState)
    workflow.add_node("fetch_events", fetch_events_node)
    workflow.add_node("define_funnels", define_funnels_node)
    workflow.add_node("calculate_dropoffs", calculate_dropoffs_node)
    workflow.add_node("diagnose_friction", _diagnose)
    workflow.add_node("rag_context", rag_context_node)
    workflow.add_node("generate_recommendations", _recommend)
    workflow.add_node("store", store_node)

    workflow.set_entry_point("fetch_events")
    workflow.add_edge("fetch_events", "define_funnels")
    workflow.add_edge("define_funnels", "calculate_dropoffs")
    workflow.add_edge("calculate_dropoffs", "diagnose_friction")
    workflow.add_edge("diagnose_friction", "rag_context")
    workflow.add_edge("rag_context", "generate_recommendations")
    workflow.add_edge("generate_recommendations", "store")
    workflow.add_edge("store", END)

    return workflow.compile()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

@traceable(name="journey_agent")
async def run_journey_analysis(client_id: UUID) -> None:
    """
    Run the full Behavioral Journey pipeline for one client.

    Dispatched as a background task — never called synchronously inside an HTTP request
    (CLAUDE §2). Idempotent and broker-portable (RISK-04).

    Early-return guard: if OPENAI_API_KEY is unset, log and return without instantiating
    ChatOpenAI.
    """
    if not settings.openai_api_key:
        logger.warning(
            "OPENAI_API_KEY not configured; Journey agent skipped for client %s", client_id
        )
        return

    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    graph = _build_journey_graph(llm)

    initial_state: JourneyState = {
        "client_id": client_id,
        "journey_events": [],
        "funnel_steps": [],
        "drop_off_analysis": [],
        "friction_diagnosis": [],
        "rag_context": [],
        "recommendations": [],
        "narrative": "",
    }

    await graph.ainvoke(initial_state)
