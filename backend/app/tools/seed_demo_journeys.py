"""
Demo seed script — inserts synthetic journey events and insights for a client.

Usage (inside container or activated venv):
    python -m app.tools.seed_demo_journeys <client_uuid>

Exposes:
    async run(client_id: UUID) -> int   — number of insight rows inserted
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.database import acquire_for_client

_NOW = datetime.now(timezone.utc)

_EVENTS = [
    {
        "session_id": "demo-sess-001",
        "user_id": "demo-user-001",
        "event_type": "page_view",
        "properties": {"page": "/signup", "referrer": "google"},
        "occurred_at": _NOW - timedelta(hours=48),
    },
    {
        "session_id": "demo-sess-001",
        "user_id": "demo-user-001",
        "event_type": "form_start",
        "properties": {"form": "signup_form"},
        "occurred_at": _NOW - timedelta(hours=48, minutes=-2),
    },
    {
        "session_id": "demo-sess-001",
        "user_id": "demo-user-001",
        "event_type": "abandon",
        "properties": {"form": "signup_form", "last_field": "company_size"},
        "occurred_at": _NOW - timedelta(hours=47, minutes=50),
    },
    {
        "session_id": "demo-sess-002",
        "user_id": "demo-user-002",
        "event_type": "page_view",
        "properties": {"page": "/onboarding/connect-source"},
        "occurred_at": _NOW - timedelta(hours=24),
    },
    {
        "session_id": "demo-sess-002",
        "user_id": "demo-user-002",
        "event_type": "click",
        "properties": {"element": "connect_zendesk_btn"},
        "occurred_at": _NOW - timedelta(hours=24, minutes=-1),
    },
    {
        "session_id": "demo-sess-002",
        "user_id": "demo-user-002",
        "event_type": "abandon",
        "properties": {"page": "/onboarding/connect-source", "reason": "credential_confusion"},
        "occurred_at": _NOW - timedelta(hours=23, minutes=50),
    },
]

_INSIGHTS = [
    {
        "funnel_step": "Sign Up → Company Size",
        "drop_off_rate": 0.41,
        "friction_score": 0.72,
        "friction_cause": "ux_friction",
        "recommendation": (
            "The company_size field is the top abandonment trigger on the sign-up form. "
            "Consider making it optional or replacing the free-text input with a dropdown — "
            "reducing cognitive load at this step historically recovers 15–25% of drop-offs."
        ),
        "projected_lift": 0.18,
    },
    {
        "funnel_step": "Onboarding → Connect Data Source",
        "drop_off_rate": 0.35,
        "friction_score": 0.61,
        "friction_cause": "messaging",
        "recommendation": (
            "Users reaching the 'Connect Source' step are dropping off before entering credentials. "
            "Copy testing shows the phrase 'API key' creates anxiety for non-technical users. "
            "Reframe as 'Connect your Zendesk account' with a step-by-step guide inline — "
            "this typically reduces friction by 20–30% in B2B onboarding flows."
        ),
        "projected_lift": 0.22,
    },
    {
        "funnel_step": "Dashboard → First Insight",
        "drop_off_rate": 0.28,
        "friction_score": 0.48,
        "friction_cause": "expectation",
        "recommendation": (
            "28% of activated users never trigger their first analysis. "
            "User interviews suggest the dashboard looks empty on first login and it's unclear what to do next. "
            "An onboarding checklist (3-step guide: connect source → trigger analysis → view insight) "
            "would close this expectation gap. Projected time-to-first-insight improvement: ~40%."
        ),
        "projected_lift": 0.15,
    },
]


async def run(client_id: UUID) -> int:
    inserted_insights = 0
    async with acquire_for_client(client_id) as conn:
        # Check if demo insights already exist for this client
        existing_count = await conn.fetchval(
            "SELECT COUNT(*) FROM journey_insights WHERE client_id = $1",
            client_id,
        )
        if existing_count and existing_count > 0:
            return 0

        # Insert journey events
        for ev in _EVENTS:
            await conn.execute(
                """INSERT INTO journey_events
                       (id, client_id, session_id, user_id, event_type,
                        properties, occurred_at, ingested_at)
                   VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())""",
                uuid.uuid4(),
                client_id,
                ev["session_id"],
                ev["user_id"],
                ev["event_type"],
                json.dumps(ev["properties"]),
                ev["occurred_at"],
            )

        # Insert journey insights
        for ins in _INSIGHTS:
            await conn.execute(
                """INSERT INTO journey_insights
                       (id, client_id, funnel_step, drop_off_rate, friction_score,
                        friction_cause, recommendation, projected_lift, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())""",
                uuid.uuid4(),
                client_id,
                ins["funnel_step"],
                ins["drop_off_rate"],
                ins["friction_score"],
                ins["friction_cause"],
                ins["recommendation"],
                ins["projected_lift"],
            )
            inserted_insights += 1

    return inserted_insights


if __name__ == "__main__":
    import sys
    from app import database
    if len(sys.argv) < 2:
        print("Usage: python -m app.tools.seed_demo_journeys <client_uuid>")
        sys.exit(1)
    client_uuid = sys.argv[1]
    
    async def main():
        await database.init_pool()
        await run(UUID(client_uuid))
        await database.close_pool()
        
    asyncio.run(main())
