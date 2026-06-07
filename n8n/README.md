# n8n — orchestration & delivery layer

n8n is the cron/trigger + delivery layer. **It does no AI work** (CLAUDE.md §13, ADR-006): it schedules, loops over clients, calls FastAPI endpoints, routes on results, and delivers via Slack/Resend. FastAPI + LangGraph do all business logic.

## Workflow lifecycle (CLAUDE §13)

1. Build workflows locally in the n8n UI at `http://localhost:5678` (started by `docker compose up`).
2. **Export each workflow to JSON into `n8n/workflows/`** and commit it. Production runs the exported workflows.

## The four official workflows (built in Phase 6 — INFRASTRUCTURE_ARCHITECTURE.md §5)

1. **Daily Feedback Ingestion** — every 6h → `GET /api/clients/active-list` → loop → `POST /api/ingest/trigger` → if `ingestion_count > 0` → `POST /api/agents/voc/run`.
2. **Competitive Signal Monitor** — every 2h → `GET /api/clients/with-competitive-monitoring` → loop → `POST /api/agents/competitive-signal/run` → if `urgency = "critical"` → Slack `#client-alerts` + Resend.
3. **Weekly Report Generation** — Mon 9:00 → `GET /api/clients/active-list` → loop → `POST /api/reports/generate` → Resend with S3 link.
4. **Churn Alert (webhook)** — `POST /webhook/churn-alert` → `> 0.25` URGENT (Resend + Slack `#churn-monitor`); else `> 0.15` standard early-warning Resend.

> The endpoint paths above are a contract — do not rename them without updating the workflows in the same change (CLAUDE §13).

This directory is empty until Phase 6; the exported workflow JSON files land here.
