# Incident Response Runbook

> **Status:** AUTHORED — UNVERIFIED (no live AWS access). Validate procedures against real AWS console / CloudWatch state before first production incident.
> Account: `456788081187` · Region: `ap-southeast-2` · Cluster: `dataautomated-prod`

---

## Severity Levels

| Level | Description | Response Time | Example |
|---|---|---|---|
| **P1 — Critical** | All clients down; data breach; auth bypass | 15 min | ECS tasks stopped, DB unreachable, leaked secret |
| **P2 — High** | One service failing; agent pipeline stopped | 1 h | VoC agent 100% error rate, n8n workflows not triggering |
| **P3 — Medium** | Degraded performance; single-client issue | 4 h | High latency, one client's reports failing |
| **P4 — Low** | Cosmetic; monitoring gap | Next business day | Chart rendering issue, missing CloudWatch metric |

---

## Contact Tree

| Role | Contact | When |
|---|---|---|
| On-call engineer | PagerDuty escalation | P1/P2 any time |
| Platform lead | Slack `#platform-oncall` | P1 always; P2 if unresolved > 30 min |
| Security officer | Direct DM | Any suspected data breach or auth bypass |

---

## Runbook Index

- [Auth Incident](#auth-incident)
- [Database Incident](#database-incident)
- [Tenant Isolation Violation](#tenant-isolation-violation)
- [Failed Deployment](#failed-deployment)
- [Failed Report Generation](#failed-report-generation)
- [Webhook Abuse / DDoS](#webhook-abuse--ddos)
- [OpenAI Outage](#openai-outage)
- [Secret Leak](#secret-leak)

---

## Auth Incident

**Symptoms:** Elevated 401/403 rate on `/auth/token`; users can't log in; JWT validation errors in CloudWatch.

**Triage:**
```
# Check ECS backend logs
aws logs filter-log-events \
  --log-group-name /ecs/dataautomated-backend \
  --filter-pattern '"JWTError" OR "Unauthorized"' \
  --start-time $(date -d '1 hour ago' +%s000) \
  --region ap-southeast-2
```

**Common causes & fixes:**

| Cause | Fix |
|---|---|
| `JWT_SECRET_KEY` rotated but old sessions still in use | Wait for TTL expiry; or force re-login by rotating key again |
| RDS failover changed DB password | Update `JWT_SECRET_KEY` in Secrets Manager; redeploy |
| Clock skew > 5 min on ECS tasks | Restart tasks — ECS Fargate syncs clock at boot |
| `users` table locked | Check RDS `pg_locks`; kill blocking query |

**Escalate if:** Login still broken after 30 min; any sign of credential stuffing (rate limiter firing for many IPs simultaneously).

---

## Database Incident

**Symptoms:** `asyncpg.exceptions.TooManyConnectionsError`; DB health check failing; RDS CPU > 90%.

**Triage:**
```
# RDS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=dataautomated-prod \
  --start-time $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ') \
  --end-time $(date -u '+%Y-%m-%dT%H:%M:%SZ') \
  --period 60 --statistics Average \
  --region ap-southeast-2
```

**Steps:**
1. Check RDS `pg_stat_activity` for blocked/long-running queries
2. If connection pool exhausted: restart backend ECS tasks (triggers pool reinit)
3. If CPU spike: identify expensive query via `pg_stat_statements`; add index or kill query
4. If RDS instance down: check Multi-AZ failover status in RDS console

**PITR restore** (if data corruption — irreversible, confirm with team lead):
```
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier dataautomated-prod \
  --target-db-instance-identifier dataautomated-restored \
  --restore-time 2026-06-12T10:00:00Z \
  --region ap-southeast-2
```
Then validate, update `DATABASE_URL` in Secrets Manager, redeploy. See `BACKUP_RESTORE.md`.

---

## Tenant Isolation Violation

**Symptoms:** A client reports seeing another company's data; cross-tenant data in logs; audit log shows mismatched `client_id`.

**This is a P1 security incident. Act immediately.**

**Steps:**
1. **Contain** — Disable the affected client's `api_key` in RDS: `UPDATE clients SET api_key = NULL, is_active = FALSE WHERE id = $affected_client_id;`
2. **Preserve evidence** — Export CloudWatch logs and RDS audit logs for the affected time window
3. **Identify scope** — Check `audit_log` table for all rows within the suspected time window for both affected clients
4. **Notify** — Alert security officer and platform lead immediately; prepare GDPR notification timeline
5. **Root cause** — Was RLS bypassed? Was `app.current_client_id` missing on a connection? Check recent migrations and code changes
6. **Fix** — Deploy patch; verify RLS is in place on all tenant tables; re-enable clients only after verification

**Evidence collection:**
```sql
SELECT * FROM audit_log
WHERE (client_id = $client_a OR client_id = $client_b)
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at;
```

---

## Failed Deployment

**Symptoms:** ECS deployment stuck; tasks not reaching RUNNING; health checks failing.

**Triage:**
```
# Check ECS service events
aws ecs describe-services \
  --cluster dataautomated-prod \
  --services dataautomated-backend \
  --region ap-southeast-2 \
  --query 'services[0].events[:10]'
```

**Steps:**
1. If migration step failed: check the migration ECS task exit code; roll back migration if needed
2. If health check failing: check `/health` endpoint manually; check container logs for startup error
3. Rollback: re-deploy previous task definition
   ```
   aws ecs update-service \
     --cluster dataautomated-prod \
     --service dataautomated-backend \
     --task-definition dataautomated-backend:PREVIOUS_REVISION \
     --region ap-southeast-2
   ```
4. If secret injection failed: check Secrets Manager → ECS task execution role permissions

---

## Failed Report Generation

**Symptoms:** n8n WF-03 completes but no PDF; `/api/reports/latest-for-client` returns `s3_url: null`; `report generation failed` in CloudWatch logs.

**Triage:**
```
aws logs filter-log-events \
  --log-group-name /ecs/dataautomated-backend \
  --filter-pattern '"report generation failed"' \
  --region ap-southeast-2
```

**Common causes:**
| Cause | Fix |
|---|---|
| S3 bucket permissions | Check ECS task role has `s3:PutObject` on `dataautomated-reports` |
| WeasyPrint missing fonts | Verify backend Docker image has `fonts-liberation` installed |
| OpenAI timeout | Check OpenAI status page; retry with backoff |
| RDS connection error in background task | Restart backend tasks to reinit pool |

---

## Webhook Abuse / DDoS

**Symptoms:** Rate limiter (`429`) firing repeatedly; abnormal request volume in CloudWatch; `audit_log` flooded with webhook entries.

**Immediate mitigations (no AWS WAF yet — UNVERIFIED):**
1. Rotate the affected vendor webhook secret immediately (Zendesk/Typeform/Intercom admin console + Secrets Manager)
2. If source IP is identifiable: add a WAF IP block rule (requires AWS WAF setup — deferred)
3. Check `_rate_limit_store` behavior — per-instance limits apply; multiple ECS tasks each enforce their own limit

**Long-term fix:** Deploy AWS WAF with rate-based rules in front of the ALB — see `LOAD_TESTING.md` for the WAF rule targets.

---

## OpenAI Outage

**Symptoms:** Agent runs failing; `openai.APIConnectionError` in LangSmith traces; VoC/CompSig/Journey agents not completing.

**Steps:**
1. Check https://status.openai.com
2. n8n workflows will retry on the next scheduled run automatically
3. No data is lost — `raw_feedback` rows remain `processed = FALSE` until agent succeeds
4. If outage > 4 h: notify affected clients via Resend that insights may be delayed
5. When OpenAI recovers: manually trigger agent runs via `POST /api/agents/voc/run` (admin + analyst roles)

---

## Secret Leak

**Symptoms:** Credential committed to Git; secret visible in CloudWatch logs; external alert.

**Immediate steps — within 5 minutes:**
1. **Rotate the secret immediately** in AWS Secrets Manager and the relevant vendor (OpenAI, Zendesk, etc.)
2. **Revoke the old value** — mark it invalid at the source
3. If committed to Git: `git filter-repo` to scrub history; force-push (with team lead approval); contact GitHub support to invalidate cached views
4. Redeploy backend to pick up new secret values
5. Check `audit_log` and CloudWatch for any access using the compromised credential

**Prevention:** `.env` is git-ignored; secrets are in Secrets Manager ARNs only; CI never logs env vars. This runbook covers the residual risk.
