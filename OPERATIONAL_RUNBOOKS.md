# Operational Runbooks

> **Status:** AUTHORED — UNVERIFIED (no live AWS access). Validate all `aws` commands against real infrastructure.
> Account: `456788081187` · Region: `ap-southeast-2` · Cluster: `dataautomated-prod`

---

## Runbook Index

1. [Deploy a new version](#1-deploy-a-new-version)
2. [Scale ECS tasks](#2-scale-ecs-tasks)
3. [Rotate a secret](#3-rotate-a-secret)
4. [Run database migrations manually](#4-run-database-migrations-manually)
5. [Trigger an agent run manually](#5-trigger-an-agent-run-manually)
6. [Re-import n8n workflows](#6-re-import-n8n-workflows)
7. [Check system health](#7-check-system-health)
8. [View agent traces in LangSmith](#8-view-agent-traces-in-langsmith)

---

## 1. Deploy a new version

**Normal path — CI handles this automatically on push to `main`.**

Manual deploy (hotfix or CI bypass — requires team-lead approval):
```bash
# Build and push backend image
IMAGE="$ECR_REGISTRY/dataautomated-backend:$GIT_SHA"
docker build -t "$IMAGE" backend/
docker push "$IMAGE"

# Run migrations in ECS
aws ecs run-task \
  --cluster dataautomated-prod \
  --task-definition dataautomated-backend \
  --launch-type FARGATE \
  --network-configuration "$ECS_NETWORK_CONFIG" \
  --overrides "{\"containerOverrides\":[{\"name\":\"backend\",\"command\":[\"alembic\",\"upgrade\",\"head\"]}]}" \
  --region ap-southeast-2

# Deploy service
aws ecs update-service \
  --cluster dataautomated-prod \
  --service dataautomated-backend \
  --force-new-deployment \
  --region ap-southeast-2

# Wait for stability
aws ecs wait services-stable \
  --cluster dataautomated-prod \
  --services dataautomated-backend \
  --region ap-southeast-2
```

**Rollback:** Replace `dataautomated-backend` task definition revision with the previous one:
```bash
aws ecs update-service \
  --cluster dataautomated-prod \
  --service dataautomated-backend \
  --task-definition dataautomated-backend:PREVIOUS_REVISION \
  --region ap-southeast-2
```

---

## 2. Scale ECS tasks

**Backend** (normal range 2–10):
```bash
aws ecs update-service \
  --cluster dataautomated-prod \
  --service dataautomated-backend \
  --desired-count 4 \
  --region ap-southeast-2
```

**n8n** — single task with EFS persistence. Do NOT scale beyond 1 without restructuring:
```bash
# Restart n8n (picks up workflow changes from EFS)
aws ecs update-service \
  --cluster dataautomated-prod \
  --service dataautomated-n8n \
  --force-new-deployment \
  --region ap-southeast-2
```

Auto-scaling policy target (CloudWatch — UNVERIFIED): CPU 60% → scale up; CPU 30% for 5 min → scale down. Verify in ECS console → Service → Auto Scaling.

---

## 3. Rotate a secret

All secrets live in AWS Secrets Manager under `dataautomated/*`.

```bash
# Update a secret value
aws secretsmanager put-secret-value \
  --secret-id dataautomated/jwt-secret-key \
  --secret-string "new-secret-value-here" \
  --region ap-southeast-2

# Force ECS task replacement so containers pick up the new value
aws ecs update-service \
  --cluster dataautomated-prod \
  --service dataautomated-backend \
  --force-new-deployment \
  --region ap-southeast-2
```

**Important:** Rotating `JWT_SECRET_KEY` invalidates all active user sessions. Coordinate with support.

**Per-client credential encryption key** (`CREDENTIAL_ENCRYPTION_KEY`): if rotated, re-encrypt all `data_sources.credentials` rows before deploying the new key. A migration script is required — do not rotate without a migration plan.

---

## 4. Run database migrations manually

Migrations run automatically during CI deploys. To run manually:
```bash
aws ecs run-task \
  --cluster dataautomated-prod \
  --task-definition dataautomated-backend \
  --launch-type FARGATE \
  --network-configuration "$ECS_NETWORK_CONFIG" \
  --overrides "{\"containerOverrides\":[{\"name\":\"backend\",\"command\":[\"alembic\",\"upgrade\",\"head\"]}]}" \
  --region ap-southeast-2
```

To view migration history:
```bash
# Connect to RDS (requires VPN or bastion host)
psql "$DATABASE_DSN" -c "SELECT version_num, is_current FROM alembic_version;"
```

---

## 5. Trigger an agent run manually

Via the API (requires admin or analyst JWT):
```bash
TOKEN="your-jwt-here"
BACKEND="http://dataautomated-alb.ap-southeast-2.elb.amazonaws.com:8000"

# VoC agent
curl -X POST "$BACKEND/api/agents/voc/run" \
  -H "Authorization: Bearer $TOKEN"

# Competitive signal agent
curl -X POST "$BACKEND/api/agents/competitive-signal/run" \
  -H "Authorization: Bearer $TOKEN"

# Journey agent
curl -X POST "$BACKEND/journeys/analyze" \
  -H "Authorization: Bearer $TOKEN"
```

All endpoints return `{"status": "analysis_queued"}` immediately and run the agent in the background. Check LangSmith for the trace.

---

## 6. Re-import n8n workflows

n8n workflows are version-controlled as JSON in `n8n/workflows/`. To import after a fresh n8n deploy:

1. Open n8n at `http://<n8n-task-ip>:5678` (via AWS VPN or bastion)
2. Credentials → recreate: Zendesk, Typeform, Intercom API keys; SMTP (Resend); Slack OAuth; N8N_WEBHOOK_SECRET header
3. Workflows → Import → select each JSON file from `n8n/workflows/`
4. Activate all four workflows
5. Test WF-01 manually: trigger "Daily Feedback Ingestion" → verify `POST /api/ingest/trigger` is called

---

## 7. Check system health

```bash
BACKEND="http://dataautomated-alb.ap-southeast-2.elb.amazonaws.com:8000"

# Backend liveness
curl -s "$BACKEND/health" | jq .

# ECS task count
aws ecs describe-services \
  --cluster dataautomated-prod \
  --services dataautomated-backend dataautomated-frontend dataautomated-n8n \
  --query 'services[*].{Name:serviceName,Running:runningCount,Desired:desiredCount}' \
  --region ap-southeast-2

# Recent backend errors (last 30 min)
aws logs filter-log-events \
  --log-group-name /ecs/dataautomated-backend \
  --filter-pattern '"ERROR"' \
  --start-time $(( $(date +%s) - 1800 ))000 \
  --region ap-southeast-2 \
  --query 'events[*].message'

# n8n workflow execution count (last 24h) — check n8n UI
# → Executions → filter by date
```

**Daily checklist** (CLAUDE.md §16):
- [ ] LangSmith: all agent runs succeeding? any failed traces?
- [ ] CloudWatch: error spikes in the last 24 h?
- [ ] n8n: all scheduled workflows ran on time?
- [ ] Database: `raw_feedback` draining? (`SELECT COUNT(*) FROM raw_feedback WHERE processed = FALSE`)
- [ ] New feature deployed: does it have a test?

---

## 8. View agent traces in LangSmith

All three agents are decorated with `@traceable` and send traces to LangSmith.

1. Log in to https://smith.langchain.com
2. Select the `dataautomated` project (LANGCHAIN_PROJECT env var)
3. Filter by run name: `voc_analysis`, `competitive_signal_analysis`, `journey_analysis`
4. A successful run shows all nodes (fetch → nlp → cluster → narrative → store) with green status
5. A failed run shows the failing node; expand to see the error and the LLM call that caused it

**Alert threshold:** 0 failed runs in 48 h (CLAUDE.md §16 QA exit bar). If any run fails, investigate and fix before shipping new features.
