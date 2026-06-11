# DEPLOYMENT.md — Phase 9 Production Rollout (AWS ECS Fargate, ap-southeast-2)

> **Status:** Authoritative runbook for the §15 production deployment.
> **Account:** `456788081187` · **Region:** `ap-southeast-2` · **ECR registry:** `456788081187.dkr.ecr.ap-southeast-2.amazonaws.com`
> Secrets appear here only as `<PLACEHOLDERS>` — real values live in AWS Secrets Manager (SR-03). Never commit `.env`.

## ⚠️ INTERIM: no-domain mode (current state, June 2026)

No domain is owned yet, so the §15 hostname topology below is **deferred**: the ACM
certificate was deleted, there is no HTTPS, and the ALB routes **by port** on its raw
DNS name (`dataautomated-alb-1029620184.ap-southeast-2.elb.amazonaws.com`):

| Port | Service |
|---|---|
| `:80` | frontend (dashboard) |
| `:8000` | backend API |
| `:5678` | n8n |

Deltas from the target topology while in this mode:
- ALB SG additionally opens 8000 + 5678 to the world; **all traffic is plain HTTP**
  (credentials/JWTs unencrypted — acceptable for testing only, fix before client traffic).
- Frontend image is built with `NEXT_PUBLIC_API_URL=http://<alb-dns>:8000` (tag suffix `-albhttp`).
- Backend task env adds `CORS_ORIGINS` including `http://<alb-dns>`.
- n8n task env uses `N8N_PROTOCOL=http`, `N8N_HOST=<alb-dns>`, `WEBHOOK_URL=http://<alb-dns>:5678/`.
- Email/Slack CTA links in workflows still point at `app.dataautomated.io` → dead links until a domain exists.

**To exit interim mode:** buy the domain → re-run the ACM + HTTPS-listener + host-rule
steps below → rebuild frontend with the real API URL → revert the n8n/CORS env deltas →
close 8000/5678 on the ALB SG.

## Topology (§15, ADR-008)

```
DNS (app./api./n8n.dataautomated.io) ──► ALB dataautomated-alb (HTTPS, host rules)
   app. ─► da-frontend-tg :3000 ─► ECS frontend  (Fargate, 2 tasks)
   api. ─► da-backend-tg  :8000 ─► ECS backend   (Fargate, 2→10 autoscale)
   n8n. ─► da-n8n-tg      :5678 ─► ECS n8n       (Fargate, 1 task + EFS)
Internal: Cloud Map namespace dataautomated.local
   backend ─► n8n   http://n8n.dataautomated.local:5678   (churn webhook)
   n8n     ─► backend http://backend.dataautomated.local:8000
   frontend─► backend (SSR) via API_URL_INTERNAL
Data: RDS PostgreSQL 16 + pgvector (private VPC) · S3 dataautomated-reports-apse2-prod (private)
```

**Runtime AWS access is via ECS task roles only — no static keys in any task env.**
Presigned S3 URLs are minted per-click by the backend (15-min expiry) — links signed
with task-role temporary credentials die when the session rotates (~6h), so nothing
long-lived embeds a presigned URL (WF03 emails link to the dashboard instead).

## Resource names (canonical)

| Kind | Name |
|---|---|
| IAM roles | `dataautomated-ecs-execution`, `dataautomated-backend-task` |
| Secrets | `dataautomated/prod/backend`, `dataautomated/prod/n8n` (JSON key/value) |
| ECR repos | `dataautomated/backend`, `dataautomated/frontend` |
| ECS cluster / services | `dataautomated-prod` / `backend`, `frontend`, `n8n` |
| Log groups | `/ecs/dataautomated-backend`, `-frontend`, `-n8n` |
| Security groups | `da-alb-sg`, `da-svc-sg` |
| Cloud Map | namespace `dataautomated.local` (services `backend`, `n8n`) |
| EFS | `dataautomated-n8n` (access point → `/home/node/.n8n`, uid/gid 1000) |
| ALB / TGs | `dataautomated-alb` / `da-backend-tg`, `da-frontend-tg`, `da-n8n-tg` |

---

## Stage 1 — Account bootstrap (run once, AWS CloudShell, admin)

### 1.1 IAM roles

```bash
cat > /tmp/ecs-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

aws iam create-role --role-name dataautomated-ecs-execution \
  --assume-role-policy-document file:///tmp/ecs-trust.json
aws iam attach-role-policy --role-name dataautomated-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name dataautomated-ecs-execution \
  --policy-name read-dataautomated-secrets --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Action":"secretsmanager:GetSecretValue",
      "Resource":"arn:aws:secretsmanager:ap-southeast-2:456788081187:secret:dataautomated/prod/*"}]}'

aws iam create-role --role-name dataautomated-backend-task \
  --assume-role-policy-document file:///tmp/ecs-trust.json
aws iam put-role-policy --role-name dataautomated-backend-task \
  --policy-name reports-bucket-rw --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject"],
      "Resource":"arn:aws:s3:::dataautomated-reports-apse2-prod/*"}]}'
```

### 1.2 Secrets (fill `<...>` before pasting; values from your password manager / RDS)

```bash
aws secretsmanager create-secret --name dataautomated/prod/backend --secret-string '{
  "DATABASE_URL":"postgresql+asyncpg://<RDS_USER>:<RDS_PASSWORD>@dataautomated-db.cva4ww4wo3kz.ap-southeast-2.rds.amazonaws.com:5432/dataautomated",
  "DATABASE_DSN":"postgresql://<RDS_USER>:<RDS_PASSWORD>@dataautomated-db.cva4ww4wo3kz.ap-southeast-2.rds.amazonaws.com:5432/dataautomated",
  "JWT_SECRET_KEY":"<FRESH_64CHAR_RANDOM>",
  "CREDENTIAL_ENCRYPTION_KEY":"<FRESH_64CHAR_RANDOM>",
  "OPENAI_API_KEY":"<OPENAI_API_KEY>",
  "LANGCHAIN_API_KEY":"<LANGSMITH_KEY>",
  "LANGSMITH_WORKSPACE_ID":"<LANGSMITH_WORKSPACE_ID>",
  "N8N_WEBHOOK_SECRET":"<FRESH_64CHAR_RANDOM>",
  "RESEND_API_KEY":"<RESEND_API_KEY>"}'

aws secretsmanager create-secret --name dataautomated/prod/n8n --secret-string '{
  "N8N_ENCRYPTION_KEY":"<FRESH_32CHAR_RANDOM>",
  "N8N_BASIC_AUTH_PASSWORD":"<FRESH_RANDOM>",
  "N8N_WEBHOOK_SECRET":"<SAME_AS_BACKEND_N8N_WEBHOOK_SECRET>",
  "RESEND_API_KEY":"<RESEND_API_KEY>",
  "SLACK_BOT_TOKEN":"<SLACK_BOT_TOKEN>"}'
```

Generate fresh randoms with: `openssl rand -base64 48` (64-char) / `openssl rand -hex 16` (32-char).
**Never reuse local-dev values for JWT/encryption keys in production.**

### 1.3 Temporary deployment policy (lets the workstation run Stages 2–4; DETACH at 7.8)

```bash
aws iam put-user-policy --user-name dataautomated-s3-user \
  --policy-name TEMP-phase9-deploy --policy-document '{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":["ecr:*"],"Resource":"*"},
    {"Effect":"Allow","Action":["ecs:*","logs:*","servicediscovery:*",
      "elasticfilesystem:*","elasticloadbalancing:*","acm:*",
      "application-autoscaling:*","cloudwatch:PutMetricAlarm","cloudwatch:DescribeAlarms",
      "ec2:Describe*","ec2:CreateSecurityGroup","ec2:AuthorizeSecurityGroup*",
      "ec2:CreateTags","route53:*","rds:Describe*"],"Resource":"*"},
    {"Effect":"Allow","Action":"iam:PassRole",
     "Resource":["arn:aws:iam::456788081187:role/dataautomated-ecs-execution",
                 "arn:aws:iam::456788081187:role/dataautomated-backend-task"]},
    {"Effect":"Allow","Action":["iam:CreateServiceLinkedRole"],"Resource":"*"}
  ]}'
```

---

## Stage 2 — Build & push images (workstation)

```powershell
# ECR login without AWS CLI (token via boto3 in the backend container):
docker compose exec -T backend python -c "import boto3,base64; t=boto3.client('ecr',region_name='ap-southeast-2').get_authorization_token()['authorizationData'][0]; print(base64.b64decode(t['authorizationToken']).decode().split(':',1)[1])" | docker login --username AWS --password-stdin 456788081187.dkr.ecr.ap-southeast-2.amazonaws.com

$REG = "456788081187.dkr.ecr.ap-southeast-2.amazonaws.com"
$SHA = (git rev-parse --short HEAD)

docker build -t "$REG/dataautomated/backend:$SHA" -t "$REG/dataautomated/backend:latest" backend
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.dataautomated.io `
  -t "$REG/dataautomated/frontend:$SHA" -t "$REG/dataautomated/frontend:latest" frontend
docker push --all-tags "$REG/dataautomated/backend"
docker push --all-tags "$REG/dataautomated/frontend"
```

(Repos are created first via `ecr.create_repository` — scripted in Stage 3 provisioning.)

## Stage 3 — Infrastructure (scripted via boto3 from the workstation)

Order: VPC/subnet discovery → SGs → log groups → Cloud Map namespace + services →
EFS + access point + mount targets → ECS cluster → ACM cert (DNS-validated) →
ALB + target groups + listeners. The provisioning script prints:
1. the **RDS SG ingress command** for the admin: allow `da-svc-sg` → RDS SG on 5432;
2. the **ACM validation CNAMEs** to add wherever dataautomated.io DNS is hosted;
3. the **ALB DNS name** for the `app`/`api`/`n8n` CNAME/ALIAS records.

Health checks: backend TG → `GET /health` (200), frontend TG → `GET /` (200),
n8n TG → `GET /healthz` (200).

## Stage 4 — Task definitions, migration, services

### Env/secret wiring per service

**backend** (taskRole `dataautomated-backend-task`, 0.5 vCPU/1 GB, 4 uvicorn workers)
- secrets (from `dataautomated/prod/backend`): `DATABASE_URL`, `DATABASE_DSN`, `JWT_SECRET_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `LANGCHAIN_API_KEY`, `LANGSMITH_WORKSPACE_ID`, `N8N_WEBHOOK_SECRET`, `RESEND_API_KEY`
- env: `ENV=production`, `AWS_REGION=ap-southeast-2`, `S3_REPORTS_BUCKET=dataautomated-reports-apse2-prod`, `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT=dataautomated-prod`, `N8N_WEBHOOK_URL=http://n8n.dataautomated.local:5678`
- `S3_ENDPOINT_URL` is **unset** → boto3 default chain → task role. No static keys.

**frontend** (no task role, 0.25 vCPU/0.5 GB)
- env: `NODE_ENV=production`, `API_URL_INTERNAL=http://backend.dataautomated.local:8000`
- `NEXT_PUBLIC_API_URL=https://api.dataautomated.io` is baked at image build (Stage 2).

**n8n** (no task role, 0.5 vCPU/1 GB, EFS access point → `/home/node/.n8n`)
- secrets (from `dataautomated/prod/n8n`): `N8N_ENCRYPTION_KEY`, `N8N_BASIC_AUTH_PASSWORD`, `N8N_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SLACK_BOT_TOKEN`
- env: `N8N_HOST=n8n.dataautomated.io`, `N8N_PROTOCOL=https`, `WEBHOOK_URL=https://n8n.dataautomated.io/`, `N8N_PORT=5678`, `N8N_BASIC_AUTH_ACTIVE=true`, `N8N_BASIC_AUTH_USER=admin`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_ENV_VARS_ALLOW_ALL=true`, `BACKEND_URL=http://backend.dataautomated.local:8000`

### Migration (before services start)

```text
ecs run-task  cluster=dataautomated-prod  taskDefinition=dataautomated-backend
              overrides.containerOverrides[0].command = ["alembic","upgrade","head"]
→ tail /ecs/dataautomated-backend until "Running upgrade ... -> 0003" then exit 0.
```

The backend image carries `alembic.ini` + `alembic/` precisely for this. Use the
`alembic` console script (NOT `python -m alembic`) — `backend/alembic/` shadows the
package when cwd is on `sys.path` (same caveat CI works around in ci.yml).

### Services

| Service | Desired | Scaling | Deployment | Notes |
|---|---|---|---|---|
| backend | 2 | target-tracking CPU 70% → max 10 | rolling 100/200 | ALB `da-backend-tg` + Cloud Map `backend` |
| frontend | 2 | none (MVP) | rolling 100/200 | ALB `da-frontend-tg` |
| n8n | 1 | **never scale out** (RISK-11) | max 100 / minHealthy 0 | ALB `da-n8n-tg` + Cloud Map `n8n`; EFS single-writer |

### Redeploy (after pushing a new image tag)

```bash
aws ecs update-service --cluster dataautomated-prod --service backend  --force-new-deployment
aws ecs update-service --cluster dataautomated-prod --service frontend --force-new-deployment
```

## Stage 5 — DNS

At the DNS host for dataautomated.io (same place the Resend records were added):
`api`, `app`, `n8n` → CNAME (or Route 53 ALIAS) to the ALB DNS name from Stage 3.

## Stage 6 — Production n8n bring-up

1. Open `https://n8n.dataautomated.io` (ALB basic auth: `admin` / `N8N_BASIC_AUTH_PASSWORD` secret) → create the n8n owner account → Settings → API → create an API key.
2. Via the n8n public REST API: create credentials `n8n-webhook-secret-credential` (httpHeaderAuth, header `X-N8N-Webhook-Secret`, prod `N8N_WEBHOOK_SECRET`) and `slack-credential-id` (slackApi, prod `SLACK_BOT_TOKEN`); import `n8n/workflows/0{1..4}*.json`; activate all four.

## Stage 7 — Production smoke test (acceptance gate)

| # | Check | Pass condition |
|---|---|---|
| 1 | `GET https://api.dataautomated.io/health` | 200 |
| 2 | `https://app.dataautomated.io` | loads < 1.5 s; login works |
| 3 | `POST /api/reports/generate` (n8n secret header) → poll `latest-for-client` | `reports` row + S3 object + presigned URL returns `%PDF` bytes |
| 4 | Dashboard `/reports` → Download | fresh 15-min presigned URL opens the PDF (task-role presign proven) |
| 5 | Cross-tenant | other client's JWT → 404 on first client's `report_id` |
| 6 | `POST https://n8n.dataautomated.io/webhook/churn-alert` score 0.30 | Slack `#churn-monitor` + URGENT email received; wrong secret → 403 |
| 7 | WF03 manual run (n8n UI) | weekly briefing email received, dashboard CTA works |
| 8 | Perf | `/api/dashboard/summary` < 300 ms; trigger endpoints < 100 ms |
| 9 | LangSmith | traces under `dataautomated-prod`, 0 failed runs |
| 10 | **Cleanup** | `aws iam delete-user-policy --user-name dataautomated-s3-user --policy-name TEMP-phase9-deploy` |

## Post-rollout hardening backlog (tracked, not blocking)

- CloudFront in front of `app.` (per §15 diagram) — additive DNS swap.
- Private subnets + NAT for ECS tasks (currently public subnets, SG-locked).
- CloudWatch alarms: `report_fetch_skip`, `report generation failed`, ALB 5xx, ECS CPU.
- Delete superseded us-east-1 bucket `dataautomated-reports`.
- Extend RLS to `data_sources`/`reports`/`knowledge_embeddings` (§5 RECOMMENDED, needs ruling).
