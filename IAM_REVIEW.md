# IAM Review Checklist

> **Status:** AUTHORED — UNVERIFIED (no live AWS access). Review against actual IAM roles/policies in account `456788081187` before marking as verified.

---

## Principle of Least Privilege (CLAUDE.md §15)

Every ECS task uses a dedicated **task execution role** (for ECR pull + CloudWatch logs + Secrets Manager) and a **task role** (for runtime AWS API calls). These are separate roles — the task role never has ECR/logs permissions.

---

## ECS Task Execution Role (`dataautomated-task-execution-role`)

Required permissions (managed by AWS-managed policies + inline):

| Permission | Resource | Why |
|---|---|---|
| `ecr:GetAuthorizationToken` | `*` | Pull images from ECR |
| `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage` | `arn:aws:ecr:ap-southeast-2:456788081187:repository/dataautomated-*` | Scoped to our ECR repos |
| `logs:CreateLogStream`, `logs:PutLogEvents` | `arn:aws:logs:ap-southeast-2:456788081187:log-group:/ecs/dataautomated-*` | Scoped to our log groups |
| `secretsmanager:GetSecretValue` | `arn:aws:secretsmanager:ap-southeast-2:456788081187:secret:dataautomated/*` | Inject secrets at task launch |

**Review checklist:**
- [ ] Confirm `ecr:*` is scoped to `dataautomated-*` repos (not `*`)
- [ ] Confirm `secretsmanager:GetSecretValue` is scoped to `dataautomated/*` (not `*`)
- [ ] No wildcard `*` on IAM or CloudFormation actions
- [ ] No `s3:*` on this role (S3 access belongs on the task role)

---

## Backend Task Role (`dataautomated-backend-task-role`)

Required permissions for runtime code:

| Permission | Resource | Why |
|---|---|---|
| `s3:PutObject` | `arn:aws:s3:::dataautomated-reports/*` | Report PDF upload |
| `s3:GetObject` | `arn:aws:s3:::dataautomated-reports/*` | Presigned URL generation |
| `s3:GeneratePresignedUrl` | (implied by `s3:GetObject`) | Dashboard download links |
| `secretsmanager:GetSecretValue` | `arn:aws:secretsmanager:ap-southeast-2:456788081187:secret:dataautomated/*` | Runtime secret reads (e.g. per-client API keys if stored in SM) |

**Review checklist:**
- [ ] No `s3:DeleteObject` or `s3:*` — app never deletes reports
- [ ] No `rds:*` — RDS access is via network (password in Secrets Manager), not IAM
- [ ] No `iam:*`, `ec2:*`, `ecs:*` on this role
- [ ] S3 bucket policy also enforces: deny `s3:GetObject` without a `dataautomated-*` principal (no public access)

---

## n8n Task Role (`dataautomated-n8n-task-role`)

n8n is the cron/trigger layer. It only calls FastAPI endpoints — it does not touch AWS services directly.

| Permission | Resource | Why |
|---|---|---|
| *(none required)* | — | n8n calls FastAPI over the internal VPC network; no AWS API needed |
| `elasticfilesystem:ClientMount`, `elasticfilesystem:ClientWrite` | `arn:aws:elasticfilesystem:ap-southeast-2:456788081187:file-system/*` | EFS mount for n8n persistence |

**Review checklist:**
- [ ] Confirm n8n task role has NO S3, Secrets Manager, or RDS permissions
- [ ] EFS access policy is scoped to the n8n EFS file system ARN only

---

## IAM Access Analyzer (UNVERIFIED)

Enable AWS IAM Access Analyzer in `ap-southeast-2` to detect overly permissive policies and cross-account access:

```bash
aws accessanalyzer create-analyzer \
  --analyzer-name dataautomated-analyzer \
  --type ACCOUNT \
  --region ap-southeast-2
```

Review findings monthly. Any `PUBLIC` or `CROSS_ACCOUNT` finding on `dataautomated-reports` S3 bucket or Secrets Manager is a P1 security incident.

---

## CI/CD IAM User (`dataautomated-ci-deploy`)

Used by GitHub Actions `deploy` job.

| Permission | Resource | Why |
|---|---|---|
| `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage` | `arn:aws:ecr:ap-southeast-2:456788081187:repository/dataautomated-*` | Push images |
| `ecs:UpdateService`, `ecs:DescribeServices`, `ecs:RunTask`, `ecs:DescribeTasks` | `arn:aws:ecs:ap-southeast-2:456788081187:*` | Deploy and run migration task |
| `iam:PassRole` | `arn:aws:iam::456788081187:role/dataautomated-task-execution-role` | ECS task launch requires PassRole |

**Review checklist:**
- [ ] This user has NO `secretsmanager:*` permission (secrets are accessed by the task at runtime, not by CI)
- [ ] `iam:PassRole` is scoped to the exact task execution role ARN (not `iam:PassRole *`)
- [ ] Credentials rotate every 90 days; stored in GitHub repository secrets
- [ ] Access key unused for > 90 days → disable immediately

---

## S3 Bucket Policy for `dataautomated-reports`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dataautomated-reports/*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::456788081187:role/dataautomated-backend-task-role"
        }
      }
    }
  ]
}
```

Block public access must be ON for this bucket (`BlockPublicAcls: true`, `BlockPublicPolicy: true`, `IgnorePublicAcls: true`, `RestrictPublicBuckets: true`).

**Review checklist:**
- [ ] Block Public Access settings are all enabled in S3 console
- [ ] No bucket ACL grants public read
- [ ] Bucket versioning is enabled (for restore capability — see `BACKUP_RESTORE.md`)
- [ ] Server-side encryption: `AES256` or KMS
