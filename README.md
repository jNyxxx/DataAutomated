# DataAutomated.io

AI-native, multi-tenant business intelligence platform (Voice-of-Customer · Competitive Signal · Behavioral Journey). Managed SaaS: clients connect data sources; the platform handles ingestion → AI analysis → interpreted insight.

> **Governance:** This repository is governed by [`CLAUDE.md`](CLAUDE.md) (the constitution), [`ARCHITECTURE_DECISION_RECORDS.md`](ARCHITECTURE_DECISION_RECORDS.md) (rationale), [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) (phase plan), and the implementation blueprint ([`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) and siblings). Read those before contributing.

## Status

**Phases 1–8 and 10 are implemented.** The repository structure (P1), database/RLS foundation (P2), FastAPI backend (P3), AI Agents (P4), MCP tools (P5), n8n workflows/reports (P6), RAG/embeddings (P7), Next.js dashboard portal (P8), and QA/tests (P10) are fully complete and verified locally. The only remaining phase is **Phase 9 (AWS Production Deployment)** to take the system live.

## Local development

Prerequisites: Docker + Docker Compose.

```powershell
cp .env.example .env        # fill in local values; .env is git-ignored (never commit it)
docker compose up --build   # starts db, backend, frontend, n8n

# Generate your initial admin account (demo@dataautomated.io) so you can log in
docker exec da_backend python app/tools/seed_demo_user.py

# Host-side database checks use localhost:5433.
cd backend
$env:DATABASE_URL="postgresql+asyncpg://dataautomated:change_me_locally@localhost:5433/dataautomated"
$env:DATABASE_DSN="postgresql://dataautomated:change_me_locally@localhost:5433/dataautomated"
$env:TEST_DATABASE_DSN=$env:DATABASE_DSN
alembic upgrade head
python -m pytest -q
```

| Service | URL | Notes |
|---|---|---|
| Backend (FastAPI) | http://localhost:8000 | health: `GET /health`; docs: `/docs` |
| Frontend (Next.js) | http://localhost:3000 | App Router, server-first |
| n8n | http://localhost:5678 | orchestration/delivery (basic auth) |
| Postgres + pgvector | localhost:5433 | `pgvector/pgvector:pg16`; inside Docker use `db:5432` |

## Repository layout

Defined and enforced by [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) (reproduces CLAUDE §4). New files go in the matching existing folder; new top-level folders require approval.

## Contributing & git discipline

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short (CLAUDE §17): branch from `main`, **PR-only merges**, **never push to `main` directly**, conventional commits (`type(scope): description`), and **never commit `.env`**.
