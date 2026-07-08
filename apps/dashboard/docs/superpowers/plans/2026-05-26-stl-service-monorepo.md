# STL Service Monorepo Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Python STL service source code into the shopee-dashboard repo and update `deploy.sh` so a single script builds and deploys both the Next.js app and the Python FastAPI service.

**Architecture:** Two containers (`shopee-dashboard` and `stl-service`) on the same `homelab` Docker network. Source code for the Python service lives under `services/stl-service/`. The `deploy.sh` script builds and deploys both in sequence. No changes to the Python service logic or API.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, opencv-python-headless, trimesh, scikit-image, shapely, scipy, numpy — unchanged from original.

---

## File Map

| Action | Path |
|--------|------|
| Create | `services/stl-service/Dockerfile` |
| Create | `services/stl-service/requirements.txt` |
| Create | `services/stl-service/service/__init__.py` |
| Create | `services/stl-service/service/main.py` |
| Create | `services/stl-service/service/auth.py` |
| Create | `services/stl-service/service/schemas.py` |
| Create | `services/stl-service/service/preview_renderer.py` |
| Create | `services/stl-service/service/routes/__init__.py` |
| Create | `services/stl-service/service/routes/generate.py` |
| Create | `services/stl-service/service/routes/preview.py` |
| Create | `services/stl-service/service/routes/check_islands.py` |
| Create | `services/stl-service/service/routes/convert.py` |
| Create | `services/stl-service/scripts/generate_shadow_casing.py` |
| Create | `services/stl-service/scripts/preprocess.py` |
| Modify | `deploy.sh` |
| Modify | `.env.deploy` |
| Modify | `.env.deploy.example` |

---

## Task 1: Copy Python service files into repo

**Files:**
- Create: `services/stl-service/` (entire directory tree)

- [ ] **Step 1: Create directory structure and copy all files**

```bash
mkdir -p services/stl-service/service/routes
mkdir -p services/stl-service/scripts

# Copy service Python files
cp /Users/adhityatangahu/Documents/Project/light-generator/service/__init__.py        services/stl-service/service/__init__.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/main.py            services/stl-service/service/main.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/auth.py            services/stl-service/service/auth.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/schemas.py         services/stl-service/service/schemas.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/preview_renderer.py services/stl-service/service/preview_renderer.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/routes/__init__.py  services/stl-service/service/routes/__init__.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/routes/generate.py  services/stl-service/service/routes/generate.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/routes/preview.py   services/stl-service/service/routes/preview.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/routes/check_islands.py services/stl-service/service/routes/check_islands.py
cp /Users/adhityatangahu/Documents/Project/light-generator/service/routes/convert.py   services/stl-service/service/routes/convert.py

# Copy generator scripts
cp /Users/adhityatangahu/Documents/Project/light-generator/scripts/generate_shadow_casing.py services/stl-service/scripts/generate_shadow_casing.py
cp /Users/adhityatangahu/Documents/Project/light-generator/scripts/preprocess.py             services/stl-service/scripts/preprocess.py

# Copy requirements
cp /Users/adhityatangahu/Documents/Project/light-generator/requirements.txt services/stl-service/requirements.txt
```

- [ ] **Step 2: Verify the tree looks right**

```bash
find services/stl-service -type f | sort
```

Expected output:
```
services/stl-service/Dockerfile           ← not yet, created in next step
services/stl-service/requirements.txt
services/stl-service/scripts/generate_shadow_casing.py
services/stl-service/scripts/preprocess.py
services/stl-service/service/__init__.py
services/stl-service/service/auth.py
services/stl-service/service/main.py
services/stl-service/service/preview_renderer.py
services/stl-service/service/routes/__init__.py
services/stl-service/service/routes/check_islands.py
services/stl-service/service/routes/convert.py
services/stl-service/service/routes/generate.py
services/stl-service/service/routes/preview.py
services/stl-service/service/schemas.py
```

---

## Task 2: Create the Dockerfile

**Files:**
- Create: `services/stl-service/Dockerfile`

The Dockerfile is identical to the original `light-generator/service/Dockerfile`. Paths are relative to `services/stl-service/` so they resolve correctly.

- [ ] **Step 1: Write the Dockerfile**

Create `services/stl-service/Dockerfile` with this exact content:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for opencv
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service + generator scripts
COPY service/ ./service/
COPY scripts/ ./scripts/

EXPOSE 8001

CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 2: Commit Task 1 + 2 together**

```bash
git add services/
git commit -m "feat: add stl-service source under services/stl-service"
```

---

## Task 3: Update deploy.sh

**Files:**
- Modify: `deploy.sh`

Add a second build+deploy block for `stl-service` before the existing Next.js block. Both containers use the `homelab` network. STL service is internal-only (no `-p` port mapping).

- [ ] **Step 1: Open `deploy.sh` and locate the config block at the top**

The block currently looks like:
```bash
MODE="${1:-build}"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="shopee-dashboard"
LOCAL_IMAGE="shopee-dashboard:latest"
GHCR_IMAGE="ghcr.io/adhityan26/3dpb-dashboard:latest"
DATA_VOLUME="/opt/stacks/shopee-dashboard/data"
```

- [ ] **Step 2: Add STL service config vars after the existing config block**

Add these lines immediately after the `DATA_VOLUME` line:

```bash
STL_CONTAINER="stl-service"
STL_LOCAL_IMAGE="stl-service:latest"
STL_BUILD_CONTEXT="$(dirname "$0")/services/stl-service"
```

- [ ] **Step 3: Find the build section and add STL build**

The current build section looks like:
```bash
if [ "$MODE" = "pull" ]; then
  echo "📦  Pulling image dari GHCR..."
  docker pull "$GHCR_IMAGE"
  DEPLOY_IMAGE="$GHCR_IMAGE"
elif [ "$MODE" = "build" ]; then
  echo "🔨  Building image di $DOCKER_HOST..."
  docker build -t "$LOCAL_IMAGE" "$(dirname "$0")"
  DEPLOY_IMAGE="$LOCAL_IMAGE"
else
  echo "❌  Mode tidak dikenal: '$MODE'. Gunakan 'build' atau 'pull'."
  exit 1
fi
```

Replace it with:
```bash
if [ "$MODE" = "pull" ]; then
  echo "📦  Pulling image dari GHCR..."
  docker pull "$GHCR_IMAGE"
  DEPLOY_IMAGE="$GHCR_IMAGE"
elif [ "$MODE" = "build" ]; then
  echo "🔨  Building shopee-dashboard image di $DOCKER_HOST..."
  docker build -t "$LOCAL_IMAGE" "$(dirname "$0")"
  DEPLOY_IMAGE="$LOCAL_IMAGE"

  echo "🔨  Building stl-service image di $DOCKER_HOST..."
  docker build -t "$STL_LOCAL_IMAGE" "$STL_BUILD_CONTEXT"
else
  echo "❌  Mode tidak dikenal: '$MODE'. Gunakan 'build' atau 'pull'."
  exit 1
fi
```

- [ ] **Step 4: Find the deploy section and add STL deploy before the Next.js deploy**

The current deploy section starts with:
```bash
echo "🚀  Deploying $DEPLOY_IMAGE ke $DOCKER_HOST..."

docker stop "$CONTAINER" 2>/dev/null && echo "   stopped $CONTAINER" || true
docker rm   "$CONTAINER" 2>/dev/null && echo "   removed $CONTAINER" || true
```

Insert these lines before that block (between the build section and the Next.js deploy):

```bash
# ── Deploy stl-service ─────────────────────────────────────────────────────────
echo "🚀  Deploying $STL_LOCAL_IMAGE → $STL_CONTAINER..."

docker stop "$STL_CONTAINER" 2>/dev/null && echo "   stopped $STL_CONTAINER" || true
docker rm   "$STL_CONTAINER" 2>/dev/null && echo "   removed $STL_CONTAINER" || true

docker run -d \
  --name "$STL_CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -e STL_SERVICE_TOKEN="${STL_SERVICE_TOKEN:-}" \
  "$STL_LOCAL_IMAGE"

echo "✅  stl-service deployed."

# ── Deploy shopee-dashboard ────────────────────────────────────────────────────
```

- [ ] **Step 5: Verify deploy.sh is valid bash**

```bash
bash -n deploy.sh && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 6: Commit**

```bash
git add deploy.sh
git commit -m "feat: deploy.sh builds and deploys stl-service alongside shopee-dashboard"
```

---

## Task 4: Update .env.deploy and .env.deploy.example

**Files:**
- Modify: `.env.deploy`
- Modify: `.env.deploy.example`

The `STL_SERVICE_URL` must point to the new container name `stl-service` (was `light-generator-stl-service-1`).

- [ ] **Step 1: Update STL_SERVICE_URL in `.env.deploy`**

Find:
```
STL_SERVICE_URL=http://light-generator-stl-service-1:8001
```

Replace with:
```
STL_SERVICE_URL=http://stl-service:8001
```

- [ ] **Step 2: Update `.env.deploy.example`**

Open `.env.deploy.example` and ensure it has an STL service section. Add or update:

```bash
# STL Service (runs as sidecar container, built from services/stl-service/)
STL_SERVICE_URL=http://stl-service:8001
STL_SERVICE_TOKEN=<shared-secret-between-nextjs-and-python>
```

- [ ] **Step 3: Commit**

```bash
git add .env.deploy.example
git commit -m "chore: update STL_SERVICE_URL to new container name stl-service"
```

Note: `.env.deploy` is gitignored — the change there is local only. No need to stage it.

---

## Task 5: Deploy and smoke test

- [ ] **Step 1: Run deploy**

```bash
bash deploy.sh
```

Watch for both build steps to succeed:
```
🔨  Building shopee-dashboard image di tcp://192.168.88.113:2375...
...
🔨  Building stl-service image di tcp://192.168.88.113:2375...
...
🚀  Deploying stl-service:latest → stl-service...
✅  stl-service deployed.
🚀  Deploying shopee-dashboard:latest ke tcp://192.168.88.113:2375...
✅  Deploy berhasil! Container 'shopee-dashboard' berjalan.
```

- [ ] **Step 2: Smoke test — stl-service health**

```bash
docker -H tcp://192.168.88.113:2375 exec shopee-dashboard \
  wget -q -O- http://stl-service:8001/health
```

Expected:
```json
{"status":"ok","service":"stl-service","version":"0.1.0"}
```

- [ ] **Step 3: Smoke test — shopee-dashboard can call STL service**

Open a confirmed LG order in the browser at `https://dashboard.3dprintingbandung.my.id/light-generator/<id>`, fill in config via LgConfigEditor, click **Shadow Preview**. Should return a shadow PNG (not a network error).

- [ ] **Step 4: Commit final state**

```bash
git add .
git status  # confirm only expected files
git commit -m "chore: verify stl-service monorepo deploy works end-to-end"
```
