#!/bin/bash
# deploy.sh — Deploy shopee-dashboard ke Docker host
#
# Usage:
#   ./deploy.sh          → build dari kode lokal, lalu deploy
#   ./deploy.sh build    → sama seperti atas
#   ./deploy.sh pull     → pull image dari GHCR (harus sudah login), lalu deploy
#
# Config via .env.deploy (gitignored) — lihat .env.deploy.example

set -euo pipefail

# ── Config defaults ────────────────────────────────────────────────────────────
MODE="${1:-build}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="shopee-dashboard"
LOCAL_IMAGE="shopee-dashboard:latest"
GHCR_IMAGE="ghcr.io/adhityan26/3dpb-dashboard:latest"
DATA_VOLUME="/opt/stacks/shopee-dashboard/data"
STL_CONTAINER="stl-service"
STL_LOCAL_IMAGE="stl-service:latest"
STL_BUILD_CONTEXT="$(dirname "$0")/services/stl-service"

export DOCKER_HOST

# ── Load .env.deploy ───────────────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/.env.deploy"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌  File .env.deploy tidak ditemukan. Copy dari .env.deploy.example dulu."
  exit 1
fi

# Load env vars (skip comments dan baris kosong)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Validate required vars ─────────────────────────────────────────────────────
REQUIRED_VARS=(
  DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET
  SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY SHOPEE_SHOP_ID
  INTERNAL_NOTIFICATION_SECRET
  AUTHENTIK_CLIENT_ID AUTHENTIK_CLIENT_SECRET AUTHENTIK_ISSUER
)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "❌  Env var '$var' kosong di .env.deploy"
    exit 1
  fi
done

# ── Tentukan image yang akan di-deploy ─────────────────────────────────────────
if [ "$MODE" = "pull" ]; then
  echo "📦  Pulling image dari GHCR..."
  docker pull "$GHCR_IMAGE"
  DEPLOY_IMAGE="$GHCR_IMAGE"
elif [ "$MODE" = "build" ]; then
  echo "🔨  Building shopee-dashboard image di $DOCKER_HOST..."
  docker build -t "$LOCAL_IMAGE" -f "$REPO_ROOT/apps/dashboard/Dockerfile" "$REPO_ROOT"
  DEPLOY_IMAGE="$LOCAL_IMAGE"

  echo "🔨  Building stl-service image di $DOCKER_HOST..."
  docker build -t "$STL_LOCAL_IMAGE" "$STL_BUILD_CONTEXT"
else
  echo "❌  Mode tidak dikenal: '$MODE'. Gunakan 'build' atau 'pull'."
  exit 1
fi

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
# Capture build date and git hash for version footer
BUILD_DATE=$(date +%Y%m%d)
BUILD_HASH=$(git rev-parse --short=5 HEAD 2>/dev/null || echo "00000")

echo "🚀  Deploying $DEPLOY_IMAGE ke $DOCKER_HOST (version: $BUILD_DATE.$BUILD_HASH)..."

docker stop "$CONTAINER" 2>/dev/null && echo "   stopped $CONTAINER" || true
docker rm   "$CONTAINER" 2>/dev/null && echo "   removed $CONTAINER" || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -p 3100:3000 \
  -v "$DATA_VOLUME:/app/data" \
  -v "/opt/stacks/cyd-firmware/latest:/app/firmware:ro" \
  -e NEXT_PUBLIC_BUILD_DATE="$BUILD_DATE" \
  -e NEXT_PUBLIC_BUILD_HASH="$BUILD_HASH" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_URL="$NEXTAUTH_URL" \
  -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  -e SHOPEE_PARTNER_ID="$SHOPEE_PARTNER_ID" \
  -e SHOPEE_PARTNER_KEY="$SHOPEE_PARTNER_KEY" \
  -e SHOPEE_SHOP_ID="$SHOPEE_SHOP_ID" \
  -e SHOPEE_BASE_URL="${SHOPEE_BASE_URL:-https://openplatform.shopee.com}" \
  -e SHOPEE_MOCK_ADS="${SHOPEE_MOCK_ADS:-false}" \
  -e SHOPEE_MOCK_ANALYTICS="${SHOPEE_MOCK_ANALYTICS:-false}" \
  -e AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}" \
  -e INTERNAL_NOTIFICATION_SECRET="$INTERNAL_NOTIFICATION_SECRET" \
  -e AUTHENTIK_CLIENT_ID="$AUTHENTIK_CLIENT_ID" \
  -e AUTHENTIK_CLIENT_SECRET="$AUTHENTIK_CLIENT_SECRET" \
  -e AUTHENTIK_ISSUER="$AUTHENTIK_ISSUER" \
  -e GEMINI_API_KEY="${GEMINI_API_KEY:-}" \
  -e HOMELAB_OCR_URL="${HOMELAB_OCR_URL:-}" \
  -e HOMELAB_OCR_SECRET="${HOMELAB_OCR_SECRET:-}" \
  -e SANITY_PROJECT_ID="${SANITY_PROJECT_ID:-}" \
  -e SANITY_DATASET="${SANITY_DATASET:-production}" \
  -e SANITY_API_VERSION="${SANITY_API_VERSION:-2024-10-01}" \
  -e SANITY_WRITE_TOKEN="${SANITY_WRITE_TOKEN:-}" \
  -e MINIO_ENDPOINT="${MINIO_ENDPOINT:-}" \
  -e MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-}" \
  -e MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-}" \
  -e MINIO_BUCKET="${MINIO_BUCKET:-lamp-orders}" \
  -e STL_SERVICE_URL="${STL_SERVICE_URL:-}" \
  -e STL_SERVICE_TOKEN="${STL_SERVICE_TOKEN:-}" \
  -e DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}" \
  -e OPS_API_SECRET="${OPS_API_SECRET:-}" \
  -e BOT_API_TOKEN="${BOT_API_TOKEN:-}" \
  -e CYD_OTA_PASSWORD="${CYD_OTA_PASSWORD:-}" \
  "$DEPLOY_IMAGE"

# ── Health check ───────────────────────────────────────────────────────────────
echo "⏳  Menunggu container ready..."
sleep 3
if docker logs "$CONTAINER" 2>&1 | grep -q "Ready in"; then
  echo "✅  Deploy berhasil! Container '$CONTAINER' berjalan."
  docker logs "$CONTAINER" --tail 5
else
  echo "⚠️   Container jalan tapi belum terdeteksi Ready. Cek logs:"
  docker logs "$CONTAINER" --tail 10
fi

# ── Cleanup dangling images & build cache ──────────────────────────────────────
echo "🧹  Membersihkan dangling images & build cache..."
docker image prune -f       2>/dev/null | grep -E "reclaimed|deleted" || true
docker builder prune -f     2>/dev/null | grep "reclaimed" || true
DISK_AFTER=$(docker system df 2>/dev/null | awk '/Images/{print $4}' | head -1)
echo "    Disk Docker: ${DISK_AFTER:-unknown}"
