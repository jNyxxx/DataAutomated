# Backup & Restore Runbook

> **Status:** AUTHORED — UNVERIFIED (no live AWS access). Validate RTO/RPO targets and restore procedures against real RDS instance before relying on them.
> Account: `456788081187` · Region: `ap-southeast-2`
> RDS Instance: `dataautomated-prod` (PostgreSQL 16 + pgvector, db.t4g.medium)
> S3 Bucket: `dataautomated-reports`

---

## Recovery Targets

| Target | Value | Notes |
|---|---|---|
| **RPO (data loss tolerance)** | ≤ 5 minutes | RDS automated backups + PITR |
| **RTO (downtime tolerance)** | ≤ 60 minutes | ECS re-deploy + DB failover |
| **Backup retention** | 7 days | RDS automated backup window |
| **Snapshot retention** | 30 days | Manual snapshots before migrations |

---

## What's Backed Up

| Asset | Mechanism | Frequency | Location |
|---|---|---|---|
| PostgreSQL database | RDS automated backups | Continuous (PITR) | AWS managed |
| PostgreSQL database | Manual RDS snapshots | Before every migration | `dataautomated-prod-snap-*` |
| Report PDFs | S3 bucket versioning | On upload | `dataautomated-reports` |
| n8n workflows | Git (exported JSON) | Every PR | `n8n/workflows/` |
| Application config | Secrets Manager | On change | `dataautomated/*` |
| Infrastructure | ECS task definitions + GitHub Actions | Every deploy | ECR + GitHub |

**Not backed up separately:** Raw feedback data (`raw_feedback.processed = TRUE` rows) — these are ingested from vendor APIs and can be re-ingested. Derived insights in `feedback_insights`, `competitive_signals`, `journey_insights` — backed up in RDS.

---

## RDS Backup Configuration

Verify in RDS console that:
- `Backup retention period`: 7 days
- `Backup window`: during low-traffic hours (e.g. 14:00–15:00 UTC)
- `Multi-AZ`: enabled (failover ~60s)
- `Point-in-time recovery`: enabled (implicit with automated backups)

```bash
# Verify backup status
aws rds describe-db-instances \
  --db-instance-identifier dataautomated-prod \
  --query 'DBInstances[0].{BackupRetentionPeriod:BackupRetentionPeriod,MultiAZ:MultiAZ,LatestRestorableTime:LatestRestorableTime}' \
  --region ap-southeast-2
```

---

## Pre-Migration Snapshot (mandatory before every migration)

```bash
SNAP_ID="dataautomated-prod-snap-$(date +%Y%m%d-%H%M%S)"
aws rds create-db-snapshot \
  --db-instance-identifier dataautomated-prod \
  --db-snapshot-identifier "$SNAP_ID" \
  --region ap-southeast-2
echo "Snapshot: $SNAP_ID"

# Wait for completion
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier "$SNAP_ID" \
  --region ap-southeast-2
echo "Snapshot ready."
```

---

## Point-in-Time Restore (PITR)

Use when: data corruption, accidental delete, or security incident.
**This creates a NEW RDS instance — does not overwrite the running one.**

```bash
TARGET_TIME="2026-06-12T10:00:00Z"   # replace with desired restore point
NEW_INSTANCE="dataautomated-restored-$(date +%Y%m%d)"

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier dataautomated-prod \
  --target-db-instance-identifier "$NEW_INSTANCE" \
  --restore-time "$TARGET_TIME" \
  --db-instance-class db.t4g.medium \
  --region ap-southeast-2

# Wait for the restored instance to be available
aws rds wait db-instance-available \
  --db-instance-identifier "$NEW_INSTANCE" \
  --region ap-southeast-2

echo "Restored instance ready: $NEW_INSTANCE"
```

**After restore — validation checklist (UNVERIFIED):**
- [ ] Connect to `$NEW_INSTANCE` and verify row counts in key tables
- [ ] Run `SELECT COUNT(*) FROM clients WHERE is_active = TRUE` — matches expected
- [ ] Verify RLS policies are in place: `SELECT * FROM pg_policies`
- [ ] Run migrations if the restore point predates any schema changes
- [ ] Update `DATABASE_URL` in Secrets Manager to point to `$NEW_INSTANCE`
- [ ] Redeploy ECS tasks to pick up new connection string
- [ ] Run smoke test: login → dashboard → verify data present
- [ ] Promote `$NEW_INSTANCE` to `dataautomated-prod` (rename) or update DNS

---

## Restore from Snapshot

```bash
SNAP_ID="dataautomated-prod-snap-20260612-100000"   # replace
NEW_INSTANCE="dataautomated-from-snap-$(date +%Y%m%d)"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$NEW_INSTANCE" \
  --db-snapshot-identifier "$SNAP_ID" \
  --db-instance-class db.t4g.medium \
  --region ap-southeast-2
```

---

## S3 Reports Restore

Report PDFs are versioned in `dataautomated-reports`. To restore a specific version:
```bash
# List versions of a specific report object
aws s3api list-object-versions \
  --bucket dataautomated-reports \
  --prefix "reports/CLIENT_ID/report-ID.pdf" \
  --region ap-southeast-2

# Restore a specific version
aws s3api get-object \
  --bucket dataautomated-reports \
  --key "reports/CLIENT_ID/report-ID.pdf" \
  --version-id "VERSION_ID" \
  restored-report.pdf \
  --region ap-southeast-2
```

---

## Restore Drill Schedule (UNVERIFIED — requires AWS access)

Drills must be run **quarterly** to validate RTO/RPO targets are achievable.

**Drill procedure:**
1. Take a snapshot of the production DB
2. Restore to a temp instance using PITR to T-1h
3. Connect the staging environment to the restored instance
4. Verify data integrity (row counts, index health, RLS policies)
5. Measure wall-clock time from "decision to restore" to "system operational" → compare to 60-min RTO
6. Document result and any gaps
7. Destroy temp instance

```bash
# Destroy temp instance after drill
aws rds delete-db-instance \
  --db-instance-identifier "$NEW_INSTANCE" \
  --skip-final-snapshot \
  --region ap-southeast-2
```
