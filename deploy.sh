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
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="shopee-dashboard"
LOCAL_IMAGE="shopee-dashboard:latest"
GHCR_IMAGE="ghcr.io/adhityan26/3dpb-dashboard:latest"
DATA_VOLUME="/opt/stacks/shopee-dashboard/data"

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
  echo "🔨  Building image di $DOCKER_HOST..."
  docker build -t "$LOCAL_IMAGE" "$(dirname "$0")"
  DEPLOY_IMAGE="$LOCAL_IMAGE"
else
  echo "❌  Mode tidak dikenal: '$MODE'. Gunakan 'build' atau 'pull'."
  exit 1
fi

# ── Deploy ─────────────────────────────────────────────────────────────────────
echo "🚀  Deploying $DEPLOY_IMAGE ke $DOCKER_HOST..."

docker stop "$CONTAINER" 2>/dev/null && echo "   stopped $CONTAINER" || true
docker rm   "$CONTAINER" 2>/dev/null && echo "   removed $CONTAINER" || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$DATA_VOLUME:/app/data" \
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
