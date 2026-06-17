"""
Agent job lifecycle — reliability DLQ (CLAUDE.md Phase 6).

Every agent run (voc / comp_signal / journey) goes through run_tracked(),
which creates an agent_jobs row and transitions it:

  queued → running → succeeded
                   → failed  (retried after exponential back-off)
                   → dead    (after max_attempts — visible in System panel)

The retry sweeper (sweep_failed_jobs) is called every ~120 s from main.py
lifespan and re-dispatches due failed jobs.
"""
from __future__ import annotations

import asyncio
import logging
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

import app.database as _db
from app.database import acquire_for_client

logger = logging.getLogger("dataautomated")

_MAX_ATTEMPTS = 3
_BASE_RETRY_SECONDS = 300  # 5 min; doubled each attempt


# ---------------------------------------------------------------------------
# Internal helpers — each is its own short transaction; all swallow DB errors
# so a broken job row never kills the agent run itself.
# ---------------------------------------------------------------------------

async def _create_job(client_id: UUID, job_type: str) -> str:
    job_id = _uuid.uuid4()
    try:
        async with acquire_for_client(client_id) as conn:
            await conn.execute(
                """INSERT INTO agent_jobs
                     (id, client_id, job_type, status, attempts, max_attempts, created_at)
                   VALUES ($1, $2, $3, 'queued', 0, $4, NOW())""",
                job_id, client_id, job_type, _MAX_ATTEMPTS,
            )
    except Exception as exc:
        logger.warning("job_service: create failed type=%s client=%s err=%s", job_type, client_id, exc)
    return str(job_id)


async def _set_running(client_id: UUID, job_id: str) -> None:
    try:
        async with acquire_for_client(client_id) as conn:
            await conn.execute(
                "UPDATE agent_jobs SET status='running', started_at=NOW() "
                "WHERE id=$1 AND client_id=$2",
                _uuid.UUID(job_id), client_id,
            )
    except Exception as exc:
        logger.warning("job_service: set_running failed job=%s err=%s", job_id, exc)


async def _set_succeeded(client_id: UUID, job_id: str) -> None:
    try:
        async with acquire_for_client(client_id) as conn:
            await conn.execute(
                "UPDATE agent_jobs SET status='succeeded', completed_at=NOW() "
                "WHERE id=$1 AND client_id=$2",
                _uuid.UUID(job_id), client_id,
            )
    except Exception as exc:
        logger.warning("job_service: set_succeeded failed job=%s err=%s", job_id, exc)


async def _fire_dead_job_alert(
    client_id: UUID, job_id: str, job_type: str, error: str
) -> None:
    """Fire-and-forget POST to n8n /webhook/agent-alert (no-op when N8N_WEBHOOK_URL is blank).
    n8n routes this to Slack #client-alerts and/or Resend (CLAUDE.md §13 operational rules)."""
    try:
        from app.config import settings as _s
        if not _s.n8n_webhook_url:
            return
        import httpx
        url = _s.n8n_webhook_url.rstrip("/") + "/webhook/agent-alert"
        headers = {}
        if _s.n8n_webhook_secret:
            headers["X-N8N-Webhook-Secret"] = _s.n8n_webhook_secret
        async with httpx.AsyncClient(timeout=10.0) as http:
            await http.post(url, json={
                "client_id": str(client_id),
                "job_id": job_id,
                "job_type": job_type,
                "status": "dead",
                "last_error": error[:500],
            }, headers=headers)
    except Exception as exc:
        logger.warning("job_service: dead-job alert dispatch failed: %s", exc)


async def _set_failed_or_dead(client_id: UUID, job_id: str, error: str) -> None:
    """Increment attempts; move to dead when max is reached, else schedule retry."""
    try:
        async with acquire_for_client(client_id) as conn:
            row = await conn.fetchrow(
                "SELECT attempts, max_attempts, job_type FROM agent_jobs "
                "WHERE id=$1 AND client_id=$2",
                _uuid.UUID(job_id), client_id,
            )
            new_attempts = (row["attempts"] if row else 0) + 1
            max_att = row["max_attempts"] if row else _MAX_ATTEMPTS
            job_type = row["job_type"] if row else "unknown"

            if new_attempts >= max_att:
                await conn.execute(
                    "UPDATE agent_jobs SET status='dead', attempts=$1, last_error=$2, "
                    "completed_at=NOW() WHERE id=$3 AND client_id=$4",
                    new_attempts, error[:2000], _uuid.UUID(job_id), client_id,
                )
                logger.warning(
                    '{"event":"job.dead","job_id":"%s","client":"%s"}', job_id, client_id
                )
                asyncio.create_task(
                    _fire_dead_job_alert(client_id, job_id, job_type, error),
                    name=f"dead_alert:{job_id}",
                )
            else:
                delay = _BASE_RETRY_SECONDS * (2 ** (new_attempts - 1))
                next_retry = datetime.now(timezone.utc) + timedelta(seconds=delay)
                await conn.execute(
                    "UPDATE agent_jobs SET status='failed', attempts=$1, last_error=$2, "
                    "next_retry_at=$3 WHERE id=$4 AND client_id=$5",
                    new_attempts, error[:2000], next_retry, _uuid.UUID(job_id), client_id,
                )
                logger.warning(
                    '{"event":"job.failed","job_id":"%s","attempt":%d,"retry_at":"%s"}',
                    job_id, new_attempts, next_retry.isoformat(),
                )
    except Exception as exc:
        logger.warning("job_service: set_failed_or_dead failed job=%s err=%s", job_id, exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_tracked(client_id: UUID, job_type: str, agent_coro) -> None:
    """
    Run an agent coroutine with full job lifecycle tracking.

    Creates a job row, marks it running, awaits the coroutine, then marks
    succeeded or failed/dead. Always swallows exceptions — background tasks
    must not propagate (CLAUDE.md §10).

    Usage:
        from app.agents.voc_agent import run_voc_analysis
        await run_tracked(client_id, "voc", run_voc_analysis(client_id))
    """
    job_id = await _create_job(client_id, job_type)
    await _set_running(client_id, job_id)
    from app.services.realtime_service import publish_event
    await publish_event(client_id, "agent_job.started", job_id, {"job_type": job_type})
    try:
        await agent_coro
        await _set_succeeded(client_id, job_id)
        await publish_event(client_id, "agent_job.completed", job_id, {"job_type": job_type, "status": "succeeded"})
        logger.info(
            '{"event":"job.succeeded","job_id":"%s","type":"%s","client":"%s"}',
            job_id, job_type, client_id,
        )
    except Exception as exc:
        await _set_failed_or_dead(client_id, job_id, str(exc))
        await publish_event(client_id, "agent_job.failed", job_id, {"job_type": job_type, "status": "failed", "error": str(exc)[:200]})


async def sweep_failed_jobs() -> None:
    """
    Retry sweeper: find failed jobs whose next_retry_at has passed and re-dispatch.
    Scans all active clients; uses acquire_for_client per tenant for RLS safety.
    Called every ~120s from the lifespan background loop in main.py.
    """
    if _db.pool is None:
        return
    try:
        clients = await _db.pool.fetch("SELECT id FROM clients WHERE is_active = TRUE")
    except Exception as exc:
        logger.warning("job_service.sweep: list clients failed: %s", exc)
        return

    for row in clients:
        client_id = row["id"]
        try:
            async with acquire_for_client(client_id) as conn:
                due = await conn.fetch(
                    """SELECT id, job_type FROM agent_jobs
                       WHERE client_id = $1 AND status = 'failed'
                         AND next_retry_at <= NOW()
                       LIMIT 5""",
                    client_id,
                )
            for job in due:
                asyncio.create_task(
                    _retry_job(client_id, str(job["id"]), job["job_type"]),
                    name=f"retry:{job['id']}",
                )
        except Exception as exc:
            logger.warning("job_service.sweep: client %s failed: %s", client_id, exc)


async def retry_job_now(client_id: UUID, job_id: str) -> None:
    """Manual retry — called from POST /api/ops/jobs/{id}/retry."""
    try:
        async with acquire_for_client(client_id) as conn:
            row = await conn.fetchrow(
                "SELECT job_type FROM agent_jobs WHERE id=$1 AND client_id=$2",
                _uuid.UUID(job_id), client_id,
            )
            if row is None:
                return
            job_type = row["job_type"]
            await conn.execute(
                "UPDATE agent_jobs SET status='queued', next_retry_at=NULL, "
                "last_error=NULL WHERE id=$1 AND client_id=$2",
                _uuid.UUID(job_id), client_id,
            )
    except Exception as exc:
        logger.warning("job_service.retry_job_now: lookup failed job=%s err=%s", job_id, exc)
        return
    asyncio.create_task(
        _retry_job(client_id, job_id, job_type),
        name=f"manual_retry:{job_id}",
    )


# ---------------------------------------------------------------------------
# Internal retry runner
# ---------------------------------------------------------------------------

async def _retry_job(client_id: UUID, job_id: str, job_type: str) -> None:
    """Reset to running and re-execute the agent for an existing job row."""
    await _set_running(client_id, job_id)
    from app.services.realtime_service import publish_event
    await publish_event(client_id, "agent_job.started", job_id, {"job_type": job_type, "retry": True})
    try:
        coro = _build_agent_coro(client_id, job_type)
        if coro is None:
            err = f"unknown job_type: {job_type}"
            await _set_failed_or_dead(client_id, job_id, err)
            await publish_event(client_id, "agent_job.failed", job_id, {"job_type": job_type, "error": err})
            return
        await coro
        await _set_succeeded(client_id, job_id)
        await publish_event(client_id, "agent_job.completed", job_id, {"job_type": job_type, "status": "succeeded"})
    except Exception as exc:
        await _set_failed_or_dead(client_id, job_id, str(exc))
        await publish_event(client_id, "agent_job.failed", job_id, {"job_type": job_type, "error": str(exc)[:200]})


def _build_agent_coro(client_id: UUID, job_type: str):
    """Return an un-awaited coroutine for the given job_type, or None."""
    from app.config import settings as _s
    if not _s.openai_api_key:
        return None
    if job_type == "voc":
        from app.agents.voc_agent import run_voc_analysis
        return run_voc_analysis(client_id)
    if job_type == "comp_signal":
        from app.agents.comp_signal_agent import run_comp_signal_analysis
        return run_comp_signal_analysis(client_id)
    if job_type == "journey":
        from app.agents.journey_agent import run_journey_analysis
        return run_journey_analysis(client_id)
    return None
