# STL Service Monorepo Merge — Design

**Goal:** Move the Python STL service source code into the shopee-dashboard repo so both the Next.js app and the Python FastAPI service are built and deployed from a single `deploy.sh`.

**Architecture:** Two-container setup. The STL service stays Python (FastAPI + opencv/trimesh/scipy — not portable to Node.js). Source code lives under `services/stl-service/`. Both containers run on the `homelab` Docker network and are managed by a single `deploy.sh`.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, opencv-python-headless, trimesh, scikit-image, shapely, scipy — unchanged from original.

---

## Directory Structure

```
shopee-dashboard/
├── services/
│   └── stl-service/
│       ├── Dockerfile          ← adapted from light-generator/service/Dockerfile
│       ├── requirements.txt    ← copied from light-generator/requirements.txt
│       ├── service/            ← FastAPI app (main.py, routes/, schemas.py, auth.py)
│       └── scripts/            ← generate_shadow_casing.py, preprocess.py, preview.py
├── deploy.sh                   ← updated: build + deploy both containers
└── ... (Next.js unchanged)
```

## Containers

| Container | Image | Network | Port |
|---|---|---|---|
| `shopee-dashboard` | `shopee-dashboard:latest` | homelab | 3100→3000 |
| `stl-service` | `stl-service:latest` | homelab | internal 8001 |

## `deploy.sh` Changes

1. Build `stl-service:latest` from `services/stl-service/` before the Next.js build.
2. Stop + remove old `stl-service` container (name: `stl-service`), then run new one.
3. Next.js build + deploy unchanged.
4. `STL_SERVICE_URL` in `.env.deploy` → `http://stl-service:8001`.

## Out of Scope

- Removing old `light-generator-stl-service-1` container — done manually by operator.
- The old `light-generator` repo web frontend — not touched.
- Any changes to the Python service logic or API.
