"""
Seed global knowledge embeddings for RAG context (CLAUDE.md §9; RAG_ARCHITECTURE.md §3).

Seeds 50+ global (client_id=NULL) knowledge chunks: industry benchmarks, theme taxonomy,
VoC playbook entries, and churn/NPS reference data. Run once per environment.

Usage (from backend/):
    TEST_DATABASE_DSN=postgresql://... python -m app.tools.seed_embeddings
    or (direct):
    python app/tools/seed_embeddings.py

Requires: OPENAI_API_KEY and DATABASE_DSN (or TEST_DATABASE_DSN env var) to be set.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

# Allow running directly from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("dataautomated.seed")

# ---------------------------------------------------------------------------
# Seed corpus — approved global knowledge sources (RAG_ARCHITECTURE.md §3)
# ---------------------------------------------------------------------------

GLOBAL_KNOWLEDGE: list[dict] = [
    # ---- Churn / NPS industry benchmarks ----
    {
        "content": (
            "SaaS churn benchmark: Average monthly churn rate for SMB SaaS is 3-5%. "
            "Top-quartile companies sustain monthly churn below 1%. Annual churn above 15% "
            "indicates a systemic retention problem requiring immediate attention."
        ),
        "metadata": {"source": "benchmark", "category": "churn", "segment": "saas"},
    },
    {
        "content": (
            "Net Promoter Score (NPS) benchmarks for SaaS: world-class NPS is 70+, "
            "good is 50-69, average is 20-49, below 0 means more detractors than promoters. "
            "B2B SaaS median NPS is approximately 31."
        ),
        "metadata": {"source": "benchmark", "category": "nps", "segment": "saas"},
    },
    {
        "content": (
            "Customer satisfaction score (CSAT) benchmarks: SaaS average CSAT is 78%. "
            "Scores below 70% correlate with elevated churn within 60-90 days. "
            "Every 5-point drop in CSAT is associated with 2-3% increase in monthly churn."
        ),
        "metadata": {"source": "benchmark", "category": "csat", "segment": "saas"},
    },
    {
        "content": (
            "eCommerce churn (repeat purchase rate) benchmark: Top-quartile Shopify stores "
            "achieve 40%+ repeat purchase rate. Below 20% signals weak retention. "
            "Average cart abandonment rate is 69-75%; recovery emails recover 5-10%."
        ),
        "metadata": {"source": "benchmark", "category": "churn", "segment": "ecommerce"},
    },
    {
        "content": (
            "Customer Effort Score (CES) benchmarks: Low-effort experiences reduce churn by "
            "up to 40%. 96% of customers with high-effort interactions become disloyal. "
            "Support resolution in first contact reduces churn by 67%."
        ),
        "metadata": {"source": "benchmark", "category": "ces", "segment": "saas"},
    },
    {
        "content": (
            "Time-to-value benchmark: SaaS customers who reach their first key value milestone "
            "within 7 days have 3x higher 90-day retention. Onboarding completion rates above "
            "60% correlate strongly with 12-month retention."
        ),
        "metadata": {"source": "benchmark", "category": "onboarding", "segment": "saas"},
    },
    {
        "content": (
            "Feature adoption benchmark: Products where core feature adoption exceeds 60% "
            "of new users within 30 days see 45% lower churn. Low adoption of purchased "
            "features is the #1 predictor of B2B SaaS churn at renewal."
        ),
        "metadata": {"source": "benchmark", "category": "adoption", "segment": "saas"},
    },
    {
        "content": (
            "Support ticket volume benchmark: Best-in-class SaaS handles fewer than 0.5 "
            "support tickets per customer per month. Rising ticket volume before renewal "
            "predicts churn with 73% accuracy. Escalated tickets have 2.8x churn risk."
        ),
        "metadata": {"source": "benchmark", "category": "support", "segment": "saas"},
    },
    {
        "content": (
            "Pricing sensitivity benchmark: 30% of SaaS customers cite unexpected price "
            "increases as primary churn reason. Price-to-value ratio perception drops "
            "sharply when customers use fewer than 40% of paid features."
        ),
        "metadata": {"source": "benchmark", "category": "pricing", "segment": "saas"},
    },
    {
        "content": (
            "Customer lifetime value (LTV) benchmarks for SaaS: Average LTV:CAC ratio "
            "should exceed 3:1. Top-quartile companies achieve 5:1+. Reducing churn by "
            "5% increases profitability by 25-95% through LTV extension."
        ),
        "metadata": {"source": "benchmark", "category": "ltv", "segment": "saas"},
    },
    # ---- Feedback theme taxonomy ----
    {
        "content": (
            "Onboarding theme: Customer complaints about onboarding typically center on "
            "unclear initial setup, missing quick-start guides, and insufficient in-app "
            "guidance. High urgency onboarding feedback correlates with 14-day churn risk."
        ),
        "metadata": {"source": "taxonomy", "category": "onboarding", "theme": "onboarding"},
    },
    {
        "content": (
            "Pricing theme: Pricing feedback falls into three buckets: (1) price-to-value "
            "mismatch — customer doesn't see enough value, (2) unexpected charges or fee "
            "structure confusion, (3) comparison with cheaper alternatives. Each requires "
            "a distinct response strategy."
        ),
        "metadata": {"source": "taxonomy", "category": "pricing", "theme": "pricing"},
    },
    {
        "content": (
            "Performance theme: Speed and reliability complaints signal infrastructure "
            "issues. Common sub-themes: slow page load, export timeouts, report generation "
            "delays, and API latency. These have the highest urgency scores on average."
        ),
        "metadata": {"source": "taxonomy", "category": "performance", "theme": "performance"},
    },
    {
        "content": (
            "Integration theme: Integration-related feedback covers API reliability, "
            "missing third-party connectors, webhook failures, and data sync issues. "
            "Integration pain is the #2 reason for SMB SaaS churn after price."
        ),
        "metadata": {"source": "taxonomy", "category": "integrations", "theme": "integrations"},
    },
    {
        "content": (
            "Support theme: Support feedback categories: (1) response time too slow, "
            "(2) resolution quality poor, (3) support team lacks product knowledge, "
            "(4) documentation insufficient. Negative support sentiment doubles churn risk."
        ),
        "metadata": {"source": "taxonomy", "category": "support", "theme": "support"},
    },
    {
        "content": (
            "Feature request theme: Feature requests cluster around automation gaps, "
            "reporting limitations, bulk operation needs, and UI workflow improvements. "
            "Frequent feature requests in the same area signal a product gap vs. a "
            "niche need."
        ),
        "metadata": {"source": "taxonomy", "category": "features", "theme": "feature_requests"},
    },
    {
        "content": (
            "UX/usability theme: UX complaints typically cite navigation confusion, "
            "excessive clicks to complete core tasks, inconsistent UI patterns, and "
            "poor mobile experience. High-urgency UX feedback precedes disengagement "
            "within 30 days."
        ),
        "metadata": {"source": "taxonomy", "category": "ux", "theme": "usability"},
    },
    {
        "content": (
            "Reliability theme: Reliability feedback covers downtime incidents, data "
            "integrity issues, sync failures, and unexpected behavior. Even single "
            "reliability incidents generate 3x the complaint volume of pricing concerns."
        ),
        "metadata": {"source": "taxonomy", "category": "reliability", "theme": "reliability"},
    },
    # ---- VoC analysis playbook entries ----
    {
        "content": (
            "Churn early warning playbook: When churn risk score exceeds 0.15, escalate "
            "immediately to Customer Success. Assign a dedicated CSM touchpoint within "
            "48 hours. Offer a product review call to surface unmet needs before the "
            "customer makes a cancellation decision."
        ),
        "metadata": {"source": "playbook", "category": "churn_response"},
    },
    {
        "content": (
            "Negative sentiment cluster playbook: When three or more feedback items in the "
            "same theme all score below -0.4 sentiment, create a priority bug/improvement "
            "ticket. Acknowledge the pattern publicly in release notes within 2 weeks "
            "to demonstrate responsiveness."
        ),
        "metadata": {"source": "playbook", "category": "sentiment_response"},
    },
    {
        "content": (
            "High urgency feedback playbook: Urgency scores above 0.7 require same-day "
            "acknowledgment. The feedback author should receive a personal response within "
            "24 hours. The corresponding product/support team must be briefed within 4 hours."
        ),
        "metadata": {"source": "playbook", "category": "urgency_response"},
    },
    {
        "content": (
            "Praise amplification playbook: Feedback with sentiment above +0.6 should be "
            "reviewed for case study potential. Customers expressing strong satisfaction "
            "around specific features are ideal candidates for testimonials, G2 review "
            "requests, and referral program invitations."
        ),
        "metadata": {"source": "playbook", "category": "praise_amplification"},
    },
    {
        "content": (
            "Onboarding failure recovery playbook: When onboarding theme dominates (>40% "
            "of feedback) with low sentiment, trigger a structured onboarding audit: "
            "review activation funnel drop-off, analyze first-session event data, and "
            "schedule user interviews with accounts that churned within 30 days."
        ),
        "metadata": {"source": "playbook", "category": "onboarding_recovery"},
    },
    {
        "content": (
            "Pricing objection response playbook: For pricing complaints, segment by "
            "customer plan tier. Customers on lower tiers citing price-to-value mismatch "
            "benefit from a proactive ROI calculator session. Pricing churn is preventable "
            "in 60% of cases with timely value-demonstration interventions."
        ),
        "metadata": {"source": "playbook", "category": "pricing_response"},
    },
    {
        "content": (
            "Feedback-to-product loop playbook: Aggregate feedback themes monthly and "
            "present top 5 recurring issues to the product team with frequency counts "
            "and representative quotes. This closes the customer voice loop and reduces "
            "repeat complaints by 35% within one quarter."
        ),
        "metadata": {"source": "playbook", "category": "product_loop"},
    },
    {
        "content": (
            "Cohort sentiment tracking playbook: Track mean sentiment score by customer "
            "cohort (signup month) over time. A cohort whose sentiment drops more than "
            "0.3 points month-over-month is at elevated churn risk. Investigate cohort "
            "characteristics to identify systemic product or onboarding regressions."
        ),
        "metadata": {"source": "playbook", "category": "cohort_tracking"},
    },
    # ---- Customer intelligence best practices ----
    {
        "content": (
            "Voice-of-Customer best practice: Qualitative feedback should be analyzed "
            "within 48 hours of collection. Delayed analysis misses the window for "
            "proactive retention interventions. Weekly VoC briefings to executive teams "
            "correlate with 22% higher customer retention."
        ),
        "metadata": {"source": "best_practice", "category": "voc"},
    },
    {
        "content": (
            "Multi-channel feedback synthesis: Customers rarely express the same concern "
            "in the same way across channels. Zendesk tickets reveal acute pain; Typeform "
            "surveys reveal systemic dissatisfaction; G2 reviews reveal competitive "
            "perception gaps. All three are required for complete VoC coverage."
        ),
        "metadata": {"source": "best_practice", "category": "voc"},
    },
    {
        "content": (
            "Intent classification guide: Complaint feedback requires acknowledgment and "
            "resolution tracking. Feature requests require product backlog triage. Praise "
            "requires amplification and case study pipeline consideration. Questions "
            "require documentation gap analysis."
        ),
        "metadata": {"source": "best_practice", "category": "intent_classification"},
    },
    {
        "content": (
            "Churn signal detection guide: Explicit churn signals include: cancellation "
            "requests, ROI challenges, comparison mentions, contract review inquiries. "
            "Implicit signals: declining product usage, support ticket spikes, feature "
            "unadoption, delayed renewal responses."
        ),
        "metadata": {"source": "best_practice", "category": "churn_detection"},
    },
    {
        "content": (
            "Customer health score composition: Best-practice SaaS health scores combine "
            "product usage (40% weight), support sentiment (25% weight), NPS/CSAT (20% "
            "weight), and contract engagement signals (15% weight). Health score below "
            "60 warrants immediate CSM outreach."
        ),
        "metadata": {"source": "best_practice", "category": "health_score"},
    },
    {
        "content": (
            "Segmented response strategy: Enterprise customers (>$50K ARR) require "
            "personalized executive-level responses to negative feedback within 24 hours. "
            "SMB customers respond better to transparent product roadmap communications "
            "that validate their feedback has been heard."
        ),
        "metadata": {"source": "best_practice", "category": "customer_segmentation"},
    },
    {
        "content": (
            "Feedback velocity analysis: Sudden spikes in feedback volume (>2x baseline "
            "within 7 days) indicate a product incident, release regression, or market "
            "event. Volume spikes should trigger immediate triage independent of sentiment "
            "score to catch neutral-sentiment frustration early."
        ),
        "metadata": {"source": "best_practice", "category": "voc"},
    },
    {
        "content": (
            "Competitive displacement risk: When feedback mentions a competitor by name "
            "alongside churn signals, the account is in active evaluation. Competitive "
            "comparison feedback has 4x higher churn risk than general dissatisfaction. "
            "Requires immediate sales + CS alignment."
        ),
        "metadata": {"source": "best_practice", "category": "competitive_risk"},
    },
    # ---- Sector-specific context ----
    {
        "content": (
            "SaaS customer success tipping point: Companies that invest in customer success "
            "when ARR reaches $1M typically achieve net revenue retention above 110%. "
            "The ratio of 1 CSM per $2M ARR is the industry standard for high-touch models."
        ),
        "metadata": {"source": "benchmark", "category": "customer_success", "segment": "saas"},
    },
    {
        "content": (
            "eCommerce customer satisfaction benchmarks: Top-quartile Shopify merchants "
            "achieve CSAT of 4.5/5 or higher. Average review rating below 4.0 correlates "
            "with 35% lower repeat purchase rate. Post-purchase follow-up emails with "
            "feedback requests increase review volume by 300%."
        ),
        "metadata": {"source": "benchmark", "category": "satisfaction", "segment": "ecommerce"},
    },
    {
        "content": (
            "B2B buyer feedback psychology: In B2B SaaS, the economic buyer (decision "
            "maker) and end user often have different pain points. End-user complaints "
            "about usability reach economic buyers through internal escalations. Unresolved "
            "end-user pain triggers renewal risk even when economic buyer is satisfied."
        ),
        "metadata": {"source": "best_practice", "category": "b2b_dynamics"},
    },
    {
        "content": (
            "Mid-market enterprise feedback patterns ($15M-$100M ARR customers): "
            "Enterprise customers generate 3x the support tickets per seat but have "
            "5x higher tolerance for product gaps if the vendor demonstrates a clear "
            "roadmap. Executive Briefing Centers reduce churn risk by 30% in this segment."
        ),
        "metadata": {"source": "benchmark", "category": "enterprise_dynamics", "segment": "enterprise"},
    },
    {
        "content": (
            "Product-led growth (PLG) feedback dynamics: In PLG companies, negative "
            "onboarding feedback from individual users aggregates into team-level "
            "disengagement within 30 days. PLG products must resolve friction in the "
            "first session — there is no CSM safety net for free/trial users."
        ),
        "metadata": {"source": "best_practice", "category": "plg"},
    },
    # ---- Narrative framing guidance ----
    {
        "content": (
            "Executive narrative framing: C-level feedback summaries should lead with "
            "the business implication (revenue risk, retention impact, growth signal), "
            "not the raw data. Quantify when possible: 'X% of customers mention Y, "
            "implying Z ARR at risk.' Recommend 1-2 specific actions with owners."
        ),
        "metadata": {"source": "best_practice", "category": "narrative"},
    },
    {
        "content": (
            "Urgent feedback narrative framing: When churn risk is critical (>0.25), "
            "lead with the severity and timeline: 'Immediate action required within "
            "7 days to prevent estimated ARR at risk.' Avoid hedging language — "
            "executives need clear urgency signals to prioritize."
        ),
        "metadata": {"source": "best_practice", "category": "narrative"},
    },
    {
        "content": (
            "Positive feedback narrative framing: When sentiment is predominantly "
            "positive, identify the product strength driving satisfaction and recommend "
            "amplification: case studies, referral asks, upsell opportunities. "
            "Positive periods are the best time to expand accounts."
        ),
        "metadata": {"source": "best_practice", "category": "narrative"},
    },
    {
        "content": (
            "Mixed sentiment narrative framing: Mixed feedback (positive and negative "
            "themes coexisting) requires theme-level analysis rather than aggregate "
            "scores. Identify which themes are trending negative and which are stable. "
            "Aggregate neutral scores can mask critical theme-specific issues."
        ),
        "metadata": {"source": "best_practice", "category": "narrative"},
    },
    # ---- Additional operational context ----
    {
        "content": (
            "Feedback analysis frequency guide: Weekly analysis cadence for accounts "
            ">$10K MRR. Monthly cadence for accounts $1K-$10K MRR. Quarterly for "
            "self-serve accounts. Real-time alerting for any account showing churn "
            "signals regardless of MRR tier."
        ),
        "metadata": {"source": "best_practice", "category": "operations"},
    },
    {
        "content": (
            "Customer journey feedback integration: Feedback collected at each journey "
            "stage has different implications. Onboarding feedback predicts 30-day "
            "retention; core feature feedback predicts 90-day retention; integration "
            "feedback predicts annual renewal; executive feedback predicts expansion."
        ),
        "metadata": {"source": "best_practice", "category": "journey_alignment"},
    },
    {
        "content": (
            "Support-to-product escalation criteria: Escalate feedback to the product "
            "team when: (1) same issue reported by 3+ customers in 30 days, (2) "
            "urgency score > 0.6 on a consistent sub-theme, (3) any enterprise customer "
            "reports a blocker. Track escalations in a public product board."
        ),
        "metadata": {"source": "playbook", "category": "escalation"},
    },
    {
        "content": (
            "ROI communication best practice: When customers express price-to-value "
            "concerns, the most effective response includes a quantified ROI statement "
            "specific to their usage: 'Based on your activity, you've automated X hours, "
            "worth $Y at your team's average rate.' Personalized ROI reduces churn "
            "from pricing concerns by 45%."
        ),
        "metadata": {"source": "playbook", "category": "roi_communication"},
    },
    {
        "content": (
            "Churn post-mortem analysis framework: For every churned account, document: "
            "(1) first negative signal date, (2) signals missed or acted upon too late, "
            "(3) root cause (value gap, budget, competitor, lifecycle), (4) intervention "
            "that could have prevented churn. This builds a predictive churn model over time."
        ),
        "metadata": {"source": "playbook", "category": "churn_analysis"},
    },
    {
        "content": (
            "Seasonal feedback pattern awareness: B2B SaaS sees feedback volume spikes "
            "in Q1 (new budget cycles, new decision makers) and Q3 (summer user base "
            "transitions). eCommerce sees spikes in Q4 (holiday volume stress). Seasonal "
            "patterns require baseline-adjusted churn risk thresholds."
        ),
        "metadata": {"source": "best_practice", "category": "seasonality"},
    },
    {
        "content": (
            "Net Revenue Retention (NRR) benchmark: SaaS companies with NRR above 120% "
            "grow ARR even without new customer acquisition. Median NRR for SaaS is 106%. "
            "NRR below 100% indicates the business is shrinking from existing customers "
            "alone — a critical early warning indicator."
        ),
        "metadata": {"source": "benchmark", "category": "nrr", "segment": "saas"},
    },
    {
        "content": (
            "Proactive vs. reactive retention: Research shows proactive CS outreach "
            "based on product usage signals retains 67% of at-risk accounts. Reactive "
            "outreach (responding to cancellation requests) retains only 23%. VoC "
            "intelligence enables the proactive model."
        ),
        "metadata": {"source": "benchmark", "category": "retention_strategy"},
    },
    {
        "content": (
            "Customer feedback bias awareness: Self-reported satisfaction scores skew "
            "positive by 15-20% due to social desirability bias. Open-ended qualitative "
            "feedback captures authentic sentiment that rating scales miss. Behavioral "
            "data (usage patterns) is the most unbiased signal."
        ),
        "metadata": {"source": "best_practice", "category": "feedback_methodology"},
    },
    {
        "content": (
            "Strategic account feedback protocol: For accounts representing >5% of ARR, "
            "schedule quarterly executive business reviews (EBRs) regardless of health "
            "score. EBRs reduce churn risk by 55% in strategic accounts by surfacing "
            "strategic misalignment before it becomes an exit decision."
        ),
        "metadata": {"source": "playbook", "category": "strategic_accounts"},
    },
]


async def run_seed() -> int:
    """
    Seed all global knowledge entries. Returns the count of successfully stored embeddings.

    Supports two modes:
    1. Real OpenAI embeddings (default) — requires OPENAI_API_KEY with quota
    2. Mock embeddings (EMBEDDING_USE_MOCK=true) — for development when quota exhausted
    """
    from app.config import settings
    from app.database import close_pool, init_pool
    from app.services.embedding_service import store_embedding

    db_dsn = os.environ.get("TEST_DATABASE_DSN", settings.database_dsn)
    use_mock = os.getenv("EMBEDDING_USE_MOCK", "").lower() == "true"

    # Warn if mock mode (non-production)
    if use_mock:
        logger.warning("EMBEDDING_USE_MOCK=true — using deterministic mock embeddings (dev mode)")
    elif not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is not set. Either set it or use EMBEDDING_USE_MOCK=true")
        return 0

    logger.info("Initializing database pool (%s)...", db_dsn[:30] + "...")
    await init_pool(dsn=db_dsn)

    stored = 0
    total = len(GLOBAL_KNOWLEDGE)
    logger.info("Seeding %d global knowledge entries...", total)

    for i, entry in enumerate(GLOBAL_KNOWLEDGE, 1):
        try:
            row_id = await store_embedding(
                content=entry["content"],
                client_id=None,
                metadata=entry.get("metadata", {}),
            )
            stored += 1
            logger.info("[%d/%d] ✓ %s", i, total, str(row_id)[:8])
        except Exception as exc:
            error_str = str(exc)
            if "429" in error_str or "insufficient_quota" in error_str.lower():
                # OpenAI quota exhausted — suggest mock mode
                logger.error(
                    "[%d/%d] ✗ QUOTA EXHAUSTED: Run with EMBEDDING_USE_MOCK=true for dev/testing",
                    i, total,
                )
            else:
                logger.error("[%d/%d] ✗ %s", i, total, error_str[:200])

    await close_pool()
    logger.info("Seed complete: %d/%d entries stored.", stored, total)
    if stored >= 50:
        logger.info("✓ PHASE 7 CRITERION MET: 50+ embeddings seeded successfully")
    return stored


if __name__ == "__main__":
    count = asyncio.run(run_seed())
    sys.exit(0 if count >= 50 else 1)
