"""
Boot-time agent trigger (CLAUDE.md §2, §10, §13).

Fires once when the FastAPI lifespan starts — runs ingestion + all three agents
for every active client so the dashboard has data immediately on boot, without
waiting for n8n's 6h/2h scheduled cycles.

Architecture notes:
  - Called via asyncio.create_task() from main.py lifespan — NOT inside an HTTP
    request, so BackgroundTasks is unavailable; raw tasks are the correct pattern.
  - Calls the same dispatcher functions used by the HTTP trigger endpoints, so
    tenant isolation, RLS, audit_log writes, and LangSmith tracing all apply
    identically to a normally-triggered run (§5, §6, §14).
  - Agents still run asynchronously off the request path — startup is not a
    request (§2/§10 rule is satisfied).
  - n8n still owns recurring schedules; this is a one-shot complement that fills
    the gap between boot and the first scheduled cycle (§13 unchanged).
  - Errors are logged and swallowed — startup health check always returns 200.
  - Works identically on docker-compose and AWS ECS Fargate: lifespan fires when
    the process starts, regardless of orchestrator.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

import app.database as _db

logger = logging.getLogger("dataautomated")


async def trigger_all_active_clients() -> None:
    """
    Query all active clients and dispatch ingestion + all three agents for each.
    Completely fire-and-forget: any exception is logged, never propagated.
    Safe no-op when the pool is not ready or when there are no active clients.
    """
    try:
        if _db.pool is None:
            logger.info("startup_trigger: pool not ready, skipping")
            return

        rows = await _db.pool.fetch(
            "SELECT id, name FROM clients WHERE is_active = TRUE"
        )
        if not rows:
            logger.info("startup_trigger: no active clients, nothing to trigger")
            return

        logger.info(
            "startup_trigger: dispatching for %d active client(s)", len(rows)
        )
        for row in rows:
            asyncio.create_task(
                _run_client(row["id"], row["name"]),
                name=f"startup_trigger:{row['id']}",
            )
    except Exception as exc:
        logger.warning("startup_trigger: failed to list clients: %s", exc)


async def _run_client(client_id: UUID, client_name: str) -> None:
    """
    Run the full data refresh pipeline for one client:
      1. Ingest from connected VoC + Journey sources (MCP tools → raw_feedback / journey_events)
      2. Run all three agents concurrently (process persisted data → insights tables)

    CompSig agent mines its own sources inside mine_signals_node, so no separate
    ingestion step is needed for competitive data (ingestion_service.py handles
    VoC + Journey sources only — consistent with n8n WF-01 contract in §13).
    """
    logger.info('{"event": "startup_trigger.start", "client": "%s"}', client_name)

    # Step 1 — ingest from connected sources (VoC tools + Journey tools)
    try:
        from app.services.ingestion_service import run_ingestion

        result = await run_ingestion(client_id)
        logger.info(
            '{"event": "startup_trigger.ingest", "client": "%s", "result": %s}',
            client_name,
            result,
        )
    except Exception as exc:
        logger.warning(
            '{"event": "startup_trigger.ingest_failed", "client": "%s", "error": "%s"}',
            client_name, exc,
        )

    # Step 2 — run all three agents concurrently (each is self-contained)
    from app.routers.insights import _run_voc_analysis
    from app.routers.signals import _run_comp_signal_analysis
    from app.routers.journeys import _run_journey_analysis

    results = await asyncio.gather(
        _run_voc_analysis(client_id),
        _run_comp_signal_analysis(client_id),
        _run_journey_analysis(client_id),
        return_exceptions=True,
    )
    for name, res in zip(("voc", "comp_sig", "journey"), results):
        if isinstance(res, Exception):
            logger.warning(
                '{"event": "startup_trigger.agent_failed", "agent": "%s", "client": "%s", "error": "%s"}',
                name, client_name, res,
            )

    logger.info('{"event": "startup_trigger.done", "client": "%s"}', client_name)
