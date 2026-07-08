# GitHub CI Pipeline — Design Spec

**Date:** 2026-04-14  
**Repo:** `git@github.com:adhityan26/3dpb-dashboard.git`  
**Status:** Approved

---

## Overview

Set up GitHub remote and a single GitHub Actions workflow that runs lint + test in parallel on every push to `master`, then builds and pushes the Docker image to GitHub Container Registry (GHCR) if both checks pass.

No automated deployment to server — the server deploy remains manual via Docker remote.

---

## Trigger

```yaml
on:
  push:
    branches: [master]
```

Only fires on `master`. No PR triggers (single-developer workflow).

---

## Workflow File

**Path:** `.github/workflows/ci.yml`

---

## Job Graph

```
push to master
    │
    ├── lint ──────────────┐
    │                      ├── build-push (needs: [lint, test])
    └── test ──────────────┘
```

`build-push` only runs when both `lint` and `test` succeed.

---

## Jobs Detail

### `lint`

| Property | Value |
|---|---|
| Runner | `ubuntu-latest` |
| Steps | checkout → setup Node 22 (npm cache) → `npm ci` → `npm run lint` |

### `test`

| Property | Value |
|---|---|
| Runner | `ubuntu-latest` |
| Steps | checkout → setup Node 22 (npm cache) → `npm ci` → `npx prisma generate` → `npm test` |

`prisma generate` is required before running tests so the Prisma client types are available.

### `build-push`

| Property | Value |
|---|---|
| Runner | `ubuntu-latest` |
| Needs | `lint`, `test` |
| Steps | checkout → login GHCR → setup Buildx → restore Docker layer cache → `docker build` → push |

---

## Caching Strategy

| Target | Mechanism | Benefit |
|---|---|---|
| `node_modules` | `actions/setup-node` with `cache: 'npm'` | Skip `npm ci` download on cache hit |
| Docker layers | `type=gha` (GitHub Actions Cache via Buildx) | Build time: ~3 min cold → ~30s warm |

---

## Image Tags

Both tags are pushed on every successful build:

- `ghcr.io/adhityan26/3dpb-dashboard:latest`
- `ghcr.io/adhityan26/3dpb-dashboard:sha-<7-char-commit-sha>`

The `sha-*` tag enables rollback to a specific commit without git history lookups.

---

## Authentication

GHCR login uses the built-in `GITHUB_TOKEN` secret — no manual secret configuration required.

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

---

## Git Remote Setup

Before the workflow can run:

1. Add remote: `git remote add origin git@github.com:adhityan26/3dpb-dashboard.git`
2. Push existing commits: `git push -u origin master`

---

## What Is NOT In Scope

- Automated deploy to Docker server at `192.168.88.113` — remains manual
- PR-based CI (no branch protection rules)
- Staging/preview environments
- Semantic versioning or release tagging

---

## Success Criteria

- Every push to `master` triggers the workflow
- Lint and test jobs run in parallel
- `build-push` is blocked if either lint or test fails
- On success, GHCR shows a new image tagged `latest` and `sha-<commit>`
- Total pipeline time under 5 minutes on warm cache
