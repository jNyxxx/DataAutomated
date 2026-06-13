"""
Demo seed script — inserts synthetic competitive signals for a client.

Usage (inside container or activated venv):
    python -m app.tools.seed_demo_signals <client_uuid>

Exposes:
    async run(client_id: UUID) -> int   — number of rows inserted
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timezone
from uuid import UUID

from app.database import acquire_for_client

_SIGNALS = [
    {
        "competitor_name": "Acme Analytics",
        "signal_type": "pricing",
        "signal_source": "https://acmeanalytics.com/pricing",
        "raw_content": "Acme Analytics dropped their Starter plan from $299/mo to $199/mo, adding unlimited data sources.",
        "strategic_context": (
            "Acme is aggressively attacking the SMB segment with a 33% price cut. "
            "This likely signals pressure from lower-cost competitors and is designed to "
            "capture mid-market trials before they evaluate alternatives. "
            "Recommend a targeted retention campaign for accounts in this tier."
        ),
        "urgency": "critical",
    },
    {
        "competitor_name": "DataFlow Pro",
        "signal_type": "product_launch",
        "signal_source": "dataflowpro.io/blog/new-features",
        "raw_content": "DataFlow Pro announced a native Shopify connector and real-time sync — available to all plans.",
        "strategic_context": (
            "DataFlow Pro closing the eCommerce integration gap directly targets our Shopify "
            "client vertical. Their real-time sync claim needs validation — if accurate, "
            "we should accelerate our own Shopify connector roadmap."
        ),
        "urgency": "high",
    },
    {
        "competitor_name": "InsightBase",
        "signal_type": "hiring",
        "signal_source": "linkedin.com/jobs",
        "raw_content": "InsightBase posted 6 new ML Engineering roles focused on 'LLM-powered insight generation'.",
        "strategic_context": (
            "InsightBase is building an LLM-powered insights layer — 12-18 months behind us. "
            "Their hiring velocity (6 roles) suggests a significant investment. "
            "This validates our AI-first positioning and creates urgency to ship visible AI features."
        ),
        "urgency": "medium",
    },
    {
        "competitor_name": "Metric Stack",
        "signal_type": "funding",
        "signal_source": "techcrunch.com",
        "raw_content": "Metric Stack raised a $22M Series B led by Accel Partners to expand enterprise sales motion.",
        "strategic_context": (
            "Metric Stack moving upmarket with fresh capital signals increased competition "
            "in the $15M–$100M ARR enterprise segment. Their enterprise push may pressure "
            "pricing across mid-market. Monitor their job postings for enterprise AE hires."
        ),
        "urgency": "medium",
    },
    {
        "competitor_name": "ClearVision AI",
        "signal_type": "review_spike",
        "signal_source": "g2.com/products/clearvision-ai",
        "raw_content": "ClearVision AI received 14 new 5-star G2 reviews in the past 30 days, many citing 'easy onboarding'.",
        "strategic_context": (
            "ClearVision's review momentum around 'easy onboarding' is a consistent theme "
            "we hear as a friction point in our own onboarding. "
            "Prioritise the onboarding checklist (QW item in our roadmap) — this is the "
            "exact differentiator ClearVision is exploiting."
        ),
        "urgency": "low",
    },
]


async def run(client_id: UUID) -> int:
    inserted = 0
    async with acquire_for_client(client_id) as conn:
        for sig in _SIGNALS:
            existing = await conn.fetchval(
                """SELECT id FROM competitive_signals
                   WHERE client_id = $1
                     AND competitor_name = $2
                     AND signal_type = $3
                   LIMIT 1""",
                client_id,
                sig["competitor_name"],
                sig["signal_type"],
            )
            if existing:
                continue
            await conn.execute(
                """INSERT INTO competitive_signals
                       (id, client_id, competitor_name, signal_type, signal_source,
                        raw_content, strategic_context, urgency, detected_at, is_read)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)""",
                uuid.uuid4(),
                client_id,
                sig["competitor_name"],
                sig["signal_type"],
                sig["signal_source"],
                sig["raw_content"],
                sig["strategic_context"],
                sig["urgency"],
                datetime.now(timezone.utc),
            )
            inserted += 1
    return inserted


if __name__ == "__main__":
    import sys
    from app import database
    if len(sys.argv) < 2:
        print("Usage: python -m app.tools.seed_demo_signals <client_uuid>")
        sys.exit(1)
    client_uuid = UUID(sys.argv[1])
    
    async def main():
        await database.init_pool()
        await run(client_uuid)
        await database.close_pool()
        
    asyncio.run(main())
