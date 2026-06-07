# Contributing to DataAutomated.io

This file operationalizes the git workflow in [`CLAUDE.md`](CLAUDE.md) §17 and the engineering governance in §18–§20. It is binding for every contributor and every Claude Code session.

## 1. Branch strategy (CLAUDE §17)

- **Never push directly to `main`.** All work happens on feature branches.
- Branch from `main`; merge back to `main` **only via Pull Request**.
- Suggested branch naming: `feat/<scope>-<short-desc>`, `fix/<scope>-<short-desc>`, `chore/<scope>-<short-desc>`.

## 2. Branch protection (apply on the remote — GitHub repo settings)

Branch protection is a remote setting; configure it on `main` when the repository is hosted:

- Require a Pull Request before merging (no direct pushes to `main`).
- Require at least **1 approving review**.
- Require status checks to pass: **CI** (`commitlint`, `backend-tests`, `frontend-build`).
- Require branches to be up to date before merging.
- Do not allow force-pushes or deletions of `main`.

> Until the remote exists, these rules are enforced socially + by the local commit-msg hook and the CI workflow in `.github/workflows/ci.yml`.

## 3. Commit format (CLAUDE §17 — enforced by commitlint)

`type(scope): description`

**Allowed types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.

**Allowed scopes** (map to the architecture/folders — see `PROJECT_STRUCTURE.md` §7):
`db`, `auth`, `fastapi`, `voc-agent`, `comp-signal-agent`, `journey-agent`, `mcp`, `rag`, `frontend`, `n8n`, `docker`, `aws`, `deps`, `repo`.

Examples (verbatim style from the Build Guide):
- `feat(voc-agent): add sentiment scoring pipeline`
- `fix(auth): resolve jwt validation issue`
- `chore(docker): update postgres image to 16`

The `commit-msg` git hook runs commitlint locally (see §4). CI re-checks commits on every PR.

## 4. Setting up local hooks

Commit-message linting uses commitlint + husky (dev tooling only):

```bash
npm install          # installs husky + commitlint (root package.json, devDependencies)
npm run prepare      # installs the husky git hooks (.husky/commit-msg)
```

## 5. PR requirements (CLAUDE §17, §18)

A PR must:
- Follow the approved folder structure (`PROJECT_STRUCTURE.md` / CLAUDE §4).
- Preserve multi-tenancy + RLS (`MULTI_TENANT_SECURITY.md` / CLAUDE §5, §6).
- Include tests for new features (CLAUDE §16).
- Not introduce forbidden tech (CLAUDE §3) or rename approved schema (CLAUDE §5).
- Pass the **Engineering Decision Framework** five gates (CLAUDE §18) — flag any failing gate instead of working around it.

## 6. Never

- Commit `.env` or any secret (CLAUDE §14; `.gitignore` enforces this).
- Push to `main` directly, or bypass RLS/auth/encryption/audit "to make something work" (CLAUDE §14, §20).
- Build a post-launch roadmap module during MVP (CLAUDE §1) or skip a foundational phase (CLAUDE §19).
