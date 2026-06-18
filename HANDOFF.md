# DataAutomated.io Handoff

This document is the GitHub-readable handoff for leadership and the next engineer. It summarizes what the system does, how it is structured, what infrastructure it needs, which secrets/configuration are required, and how to run it locally before deployment.

## What The System Does

DataAutomated.io is a multi-tenant AI analytics platform for client intelligence.

Clients connect external data sources, and the platform:

1. Ingests customer feedback, product/journey events, and competitive signals.
2. Runs AI analysis across three domains:
   - Voice of Customer
   - Competitive Signals
   - Behavioral Journey Analysis
3. Surfaces results in a dashboard.
4. Sends operational alerts and weekly PDF reports.

The intended operating model is managed SaaS:
- each customer is a tenant
- each tenant has isolated data
- customers connect their own integrations
- the platform handles ingestion, analysis, storage, delivery, and reporting

## High-Level Structure

The repository is split into four runtime parts:

### 1. Frontend

Path: [frontend](frontend)

- Next.js App Router application
- Handles login, dashboard pages, settings, onboarding, reports, and real-time UI
- Talks to the backend API
- Uses `NEXT_PUBLIC_API_URL` for browser calls
- Uses `API_URL_INTERNAL` for server-side requests in containerized environments

### 2. Backend

Path: [backend](backend)

- FastAPI application
- Custom JWT authentication
- Multi-tenant isolation via tenant-aware DB access and RLS-oriented patterns
- Data-source CRUD and credential validation
- AI agents for:
  - VoC analysis
  - competitive signal analysis
  - journey analysis
- Report generation and S3 presigning
- Webhook ingestion
- Readiness/ops endpoints for automation

### 3. Database

- PostgreSQL 16
- `pgvector` extension for embeddings / RAG
- Stores tenants, users, data sources, feedback, signals, journeys, reports, jobs, audit logs, invites, and embeddings
- Migrations are in [backend/alembic](backend/alembic)

### 4. n8n

Path: [n8n](n8n)

- Cron/scheduler and workflow orchestration layer
- Does not perform AI analysis
- Calls backend endpoints on schedules or webhooks
- Sends Slack / email notifications
- Imports version-controlled workflows from [n8n/workflows](n8n/workflows)

## Runtime Flow

The normal flow is:

1. A client connects one or more data sources.
2. The backend validates and stores the credentials encrypted.
3. n8n or backend-triggered ingestion pulls or receives data.
4. The backend stores normalized records in Postgres.
5. Agents run against tenant-scoped data.
6. Results are written back as insights/signals/journey intelligence.
7. The frontend dashboard reads those results.
8. Reports are rendered by the backend, uploaded to object storage, and delivered via n8n/email links.

## AWS Services Required

The intended production target is AWS ECS/Fargate, not EC2.

### Required

- `ECS Fargate`
  - runs `backend`
  - runs `frontend`
  - runs `n8n`
- `ECR`
  - stores backend/frontend container images
- `RDS PostgreSQL 16`
  - primary relational database
  - should support `pgvector`
- `S3`
  - stores generated report artifacts
- `EFS`
  - persistent storage for n8n state
- `Application Load Balancer`
  - routes traffic to frontend/backend/n8n
- `Secrets Manager`
  - stores production secrets
- `IAM`
  - ECS task execution role
  - backend task role for S3/Secrets access
- `CloudWatch Logs`
  - runtime logs
- `Cloud Map`
  - internal service discovery for ECS services
- `VPC`, subnets, security groups

### Needed For Normal Public Production

- `ACM`
  - TLS certificates
- `Route 53` or another DNS provider
  - `app`, `api`, and `n8n` hostnames

### Not Required By The Current Design

- `EC2`
- `Lambda`

### Optional / Future Hardening

- `CloudFront`
  - mentioned as a later hardening/performance layer, not a current requirement

## Environment Variables, Secrets, And Config

The main templates are:

- [.env.example](.env.example)
- [frontend/.env.example](frontend/.env.example)

### Core Runtime Settings

These are required for any meaningful environment:

- `APP_ENV`
- `SECRETS_BACKEND`
- `DATABASE_URL`
- `DATABASE_DSN`
- `JWT_SECRET_KEY`
- `CREDENTIAL_ENCRYPTION_KEY`
- `N8N_WEBHOOK_SECRET`
- `FRONTEND_URL`
- `NEXT_PUBLIC_API_URL`

### AI / Observability

- `OPENAI_API_KEY`
- `LANGCHAIN_TRACING_V2`
- `LANGCHAIN_API_KEY`
- `LANGCHAIN_PROJECT`
- `LANGSMITH_WORKSPACE_ID`
- `SENTRY_DSN`

Notes:
- The app can boot without `OPENAI_API_KEY`.
- Without `OPENAI_API_KEY`, agent runs are skipped or degraded.

### Report Storage / AWS

- `AWS_REGION`
- `S3_REPORTS_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_ENDPOINT_URL`
- `S3_PUBLIC_ENDPOINT_URL`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Notes:
- Production is intended to use IAM task roles rather than static keys.
- Local development can use MinIO instead of real S3.

### Delivery / Notifications

- `RESEND_API_KEY`
- `RESEND_DOMAIN`
- `RESEND_FROM_EMAIL`
- `SLACK_BOT_TOKEN`

Notes:
- invite and report email flows need Resend configuration
- Slack-driven alert workflows need a Slack bot token

### n8n

- `N8N_BASIC_AUTH_ACTIVE`
- `N8N_BASIC_AUTH_USER`
- `N8N_BASIC_AUTH_PASSWORD`
- `N8N_WEBHOOK_SECRET`
- `N8N_WEBHOOK_URL`
- `N8N_ENCRYPTION_KEY`
- `N8N_HOST`
- `N8N_PORT`

### Security / HTTP

- `ALLOWED_HOSTS`
- `CORS_ORIGINS`
- `MAX_BODY_SIZE_BYTES`

### Startup / Pooling / Load Test

- `RUN_MIGRATIONS_ON_STARTUP`
- `LOGIN_MAX_FAILED_ATTEMPTS`
- `LOGIN_LOCKOUT_WINDOW_SECONDS`
- `LOGIN_LOCKOUT_DURATION_SECONDS`
- `PASSWORD_MIN_LENGTH`
- `DB_POOL_MIN_SIZE`
- `DB_POOL_MAX_SIZE`
- `LOAD_TEST_BASE_URL`
- `LOAD_TEST_EMAIL`
- `LOAD_TEST_PASSWORD`

### Vendor Webhook Secrets

These matter in production if the corresponding webhook integrations are used:

- `ZENDESK_WEBHOOK_SECRET`
- `TYPEFORM_WEBHOOK_SECRET`
- `INTERCOM_WEBHOOK_SECRET`

### Per-Client Integration Credentials

These are not global `.env` values. They are entered through the app and stored encrypted per tenant.

Supported integrations currently expect credentials/config like:

- Zendesk: `subdomain`, `email`, `api_token`
- Typeform: `access_token`, plus `form_id` in config
- Intercom: `access_token`
- HubSpot: `access_token`
- Mixpanel: `api_secret`
- Segment: `access_token`, `space_id`
- Shopify: `shop_domain`, `access_token`
- GA4: `property_id`, `credentials_json`
- NewsAPI: `api_key`
- Reddit: `client_id`, `client_secret`, optional `user_agent`
- SerpAPI Google News: `api_key`
- Competitor monitor: competitor names in config
- G2 / Capterra / LinkedIn Jobs: no credentials

## Config Files Hire 1 Should Know

- [README.md](README.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [docker-compose.yml](docker-compose.yml)
- [docker-compose.prod.yml](docker-compose.prod.yml)
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)
- [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)
- [INFRASTRUCTURE_ARCHITECTURE.md](INFRASTRUCTURE_ARCHITECTURE.md)
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)

## Local Run Instructions

The preferred path is Docker Compose.

### Prerequisites

- Docker Desktop / Docker Engine
- Docker Compose

### 1. Create Local Env File

From the repo root:

```powershell
Copy-Item .env.example .env
```

At minimum, replace the obvious placeholder values for:

- `JWT_SECRET_KEY`
- `CREDENTIAL_ENCRYPTION_KEY`
- `N8N_BASIC_AUTH_PASSWORD`
- `N8N_WEBHOOK_SECRET`

For local browser-downloadable reports via MinIO, also set:

```env
S3_ENDPOINT_URL=http://minio:9000
S3_PUBLIC_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

### 2. Start The Stack

```powershell
docker compose up --build
```

This starts:

- backend on `http://localhost:8000`
- frontend on `http://localhost:3000`
- n8n on `http://localhost:5678`
- postgres on `localhost:5433`
- minio on `http://localhost:9000` and console on `http://localhost:9001`

### 3. Seed The Demo Account

The recommended command is:

```powershell
docker exec da_backend python app/tools/seed_demo_user.py
```

The script now works both:
- from the host
- from inside the backend container

Expected demo login:

- Email: `demo@dataautomated.io`
- Password: `Demo1234!`

If you prefer to run it from the host instead:

```powershell
python backend/app/tools/seed_demo_user.py
```

### 4. Optional: Populate The Dashboard With Demo Data

The seed user script prints the tenant/client ID. Use that ID to add sample data:

```powershell
docker exec da_backend python -m app.tools.seed_demo_signals <client_uuid>
docker exec da_backend python -m app.tools.seed_demo_journeys <client_uuid>
```

### 5. Verify The System

Basic checks:

- backend health: `http://localhost:8000/health`
- backend readiness: `http://localhost:8000/ready`
- backend docs: `http://localhost:8000/docs`
- frontend login: `http://localhost:3000/login`
- n8n UI: `http://localhost:5678`

Functional checks:

1. Log in with the demo credentials.
2. Open the dashboard.
3. Open Settings and confirm data-source management loads.
4. Open Reports and confirm the page loads.
5. If MinIO is configured, generate/download a report and confirm object storage is reachable.

### 6. Run Migrations And Tests From The Host

If Hire 1 wants to verify backend behavior outside the containers:

```powershell
cd backend
$env:DATABASE_URL="postgresql+asyncpg://dataautomated:change_me_locally@localhost:5433/dataautomated"
$env:DATABASE_DSN="postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated"
$env:TEST_DATABASE_DSN=$env:DATABASE_DSN
alembic upgrade head
python -m pytest -q
```

## Deployment Notes For Hire 1

- Production is designed around ECS Fargate, not raw VMs.
- Secrets should live in AWS Secrets Manager, not in committed `.env` files.
- The frontend requires the correct `NEXT_PUBLIC_API_URL` at build time.
- The backend expects real `JWT_SECRET_KEY` and `CREDENTIAL_ENCRYPTION_KEY` in production and will fail startup on placeholder values.
- n8n is intentionally single-instance because it uses persistent state.
- Reports are stored privately and downloaded through presigned URLs.

## Known Operational Reality

- The app boots without OpenAI, but AI analysis is disabled or degraded until `OPENAI_API_KEY` is present.
- Email features require Resend configuration.
- Slack alerts require `SLACK_BOT_TOKEN`.
- Live external integration tests require real customer/vendor API credentials.
- Local report downloads are simplest with MinIO configured in `.env`.

## Recommended Reading Order For A New Engineer

1. [README.md](README.md)
2. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
3. [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)
4. [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)
5. [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)
6. [INFRASTRUCTURE_ARCHITECTURE.md](INFRASTRUCTURE_ARCHITECTURE.md)
7. [DEPLOYMENT.md](DEPLOYMENT.md)
