"""MCP-tool ingestion pipeline (CLAUDE.md §8, §13 — n8n Workflow 1 contract).

run_ingestion(client_id) dispatches the client's connected VoC + Journey tools
and persists their normalized output:

  voc tools     → raw_feedback   (processed = FALSE; drained by the VoC agent)
  journey tools → journey_events (read by the Journey agent's fetch_events_node)

CompSig tools are NOT dispatched here — the Competitive Signal agent mines its
own sources inside mine_signals_node (comp_signal_agent.py).

Design notes:
  - Runs synchronously inside POST /api/ingest/trigger: n8n Workflow 1 branches
    on the returned ingestion_count, so the count must be real, not queued.
    This is tool I/O, not a LangGraph agent run — the §2/§10 "agents off the
    request path" rule does not apply (agent dispatch endpoints stay <100ms).
  - Tenant contract (CLAUDE.md §6): all DB access via acquire_for_client (RLS)
    plus explicit WHERE client_id = $1; client_id is always an explicit arg.
  - Dedup: n8n triggers every 6h while tools fetch a 24h window, so overlap is
    expected.  raw_feedback dedupes on (client_id, source_type, external_id);
    journey_events dedupes on (client_id, event_type, session_id, occurred_at).
  - Per-tool config (e.g. typeform form_id, segment user_ids) comes from
    data_sources.config, filtered to the tool's args_schema fields.
  - Individual tool failures are logged and skipped — a partial ingestion still
    returns the rows that succeeded (graceful degradation, RISK-10).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from app.database import acquire_for_client
from app.services.audit_service import record_audit
from app.tools.registry import TOOL_REGISTRY

logger = logging.getLogger("dataautomated")

_INGESTED_CATEGORIES = ("voc", "journey")

_INSERT_FEEDBACK = """
    INSERT INTO raw_feedback (client_id, source_id, source_type, external_id, content, metadata)
    SELECT $1, $2, $3::varchar, $4::varchar, $5::text, $6::jsonb
    WHERE NOT EXISTS (
        SELECT 1 FROM raw_feedback
        WHERE client_id = $1 AND source_type = $3::varchar AND external_id = $4::varchar
    )
"""

_INSERT_EVENT = """
    INSERT INTO journey_events (client_id, session_id, user_id, event_type, properties, occurred_at)
    SELECT $1, $2::varchar, $3::varchar, $4::varchar, $5::jsonb, $6::timestamptz
    WHERE NOT EXISTS (
        SELECT 1 FROM journey_events
        WHERE client_id = $1
          AND event_type = $4::varchar
          AND session_id IS NOT DISTINCT FROM $2::varchar
          AND occurred_at IS NOT DISTINCT FROM $6::timestamptz
    )
"""


def _parse_occurred_at(raw: Any) -> datetime | None:
    """Normalize tool-provided ISO timestamps for the TIMESTAMPTZ column."""
    if isinstance(raw, datetime):
        return raw
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _config_args(tool: Any, config: Any) -> dict:
    """Pick tool args out of data_sources.config, restricted to the args_schema."""
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            config = {}
    if not isinstance(config, dict):
        config = {}
    allowed = set(tool.args_schema.model_fields.keys()) - {"client_id"}
    return {k: v for k, v in config.items() if k in allowed}


async def _store_feedback(client_id: UUID, source_id: UUID, records: list[dict]) -> int:
    inserted = 0
    async with acquire_for_client(client_id) as conn:
        for r in records:
            content = (r.get("content") or "").strip()
            if not content:
                continue  # raw_feedback.content is NOT NULL — skip empty records
            metadata = r.get("metadata") or {}
            status = await conn.execute(
                _INSERT_FEEDBACK,
                client_id,
                source_id,
                metadata.get("source_type"),
                str(r.get("id") or ""),
                content,
                json.dumps(metadata),
            )
            if status == "INSERT 0 1":
                inserted += 1
                from app.services.realtime_service import publish_event
                await publish_event(client_id, "raw_feedback.created", str(r.get("id") or ""), {"source": metadata.get("source_type")})
    return inserted


async def _store_events(client_id: UUID, records: list[dict]) -> int:
    inserted = 0
    async with acquire_for_client(client_id) as conn:
        for r in records:
            m = r.get("metadata") or {}
            event_type = m.get("event_type") or (r.get("content") or "")
            if not event_type:
                continue
            properties = m.get("properties") or {}
            # Keep the vendor event id for traceability (journey_events has no
            # external_id column; properties JSONB is the sanctioned slot).
            properties.setdefault("external_id", str(r.get("id") or ""))
            status = await conn.execute(
                _INSERT_EVENT,
                client_id,
                m.get("session_id"),
                m.get("user_id"),
                event_type,
                json.dumps(properties),
                _parse_occurred_at(m.get("occurred_at")),
            )
            if status == "INSERT 0 1":
                inserted += 1
                from app.services.realtime_service import publish_event
                await publish_event(client_id, "journey_event.created", m.get("session_id"), {"event_type": event_type})
    return inserted


async def run_ingestion(client_id: UUID) -> dict:
    """
    Dispatch the client's connected VoC + Journey tools and persist results.

    Returns {"ingestion_count", "journey_event_count", "sources_processed"} —
    ingestion_count is the n8n Workflow 1 branch condition (> 0 → run VoC agent).
    """
    async with acquire_for_client(client_id) as conn:
        sources = await conn.fetch(
            "SELECT id, source_type, config FROM data_sources "
            "WHERE client_id = $1 AND is_active = TRUE",
            client_id,
        )

    feedback_count = 0
    event_count = 0
    processed: list[str] = []

    for source in sources:
        source_type = source["source_type"]
        tool = TOOL_REGISTRY.get(source_type)
        if tool is None or tool.category not in _INGESTED_CATEGORIES:
            continue
        try:
            from app.services.realtime_service import publish_event
            await publish_event(client_id, "data_source.sync_started", str(source["id"]), {"source_type": source_type})
            tool_input = {"client_id": client_id, **_config_args(tool, source["config"])}
            records = await tool.arun(tool_input)
        except Exception as exc:
            logger.warning(
                "ingestion: tool %s failed for client %s: %s", tool.name, client_id, exc
            )
            from app.services.realtime_service import publish_event
            await publish_event(client_id, "data_source.sync_failed", str(source["id"]), {"source_type": source_type, "error": str(exc)[:200]})
            continue
        if not records:
            processed.append(source_type)
        else:
            if tool.category == "voc":
                feedback_count += await _store_feedback(client_id, source["id"], records)
            else:
                event_count += await _store_events(client_id, records)
            processed.append(source_type)

        # Stamp last_synced_at regardless of whether new records were found —
        # the tool ran successfully and the source is up-to-date as of now.
        async with acquire_for_client(client_id) as conn:
            await conn.execute(
                "UPDATE data_sources SET last_synced_at = NOW() "
                "WHERE id = $1 AND client_id = $2",
                source["id"],
                client_id,
            )
        from app.services.realtime_service import publish_event
        await publish_event(client_id, "data_source.sync_completed", str(source["id"]), {"source_type": source_type})

    logger.info(
        '{"event": "ingestion.complete", "client_id": "%s", '
        '"ingestion_count": %d, "journey_event_count": %d, "sources": %d}',
        client_id, feedback_count, event_count, len(processed),
    )
    await record_audit(
        "ingest.run",
        client_id=client_id,
        actor="ingestion_service",
        resource="raw_feedback,journey_events",
        detail={
            "ingestion_count": feedback_count,
            "journey_event_count": event_count,
            "sources": processed,
        },
    )
    return {
        "ingestion_count": feedback_count,
        "journey_event_count": event_count,
        "sources_processed": processed,
    }
