#!/bin/bash
# deploy.sh — Deploy slizebiz (apps/saas) ke Docker host homelab
# Usage: ./deploy.sh          → build dari kode lokal, lalu deploy
# Config via .env.deploy (gitignored) — lihat .env.deploy.example
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="slizebiz"
LOCAL_IMAGE="slizebiz:latest"
export DOCKER_HOST

ENV_FILE="$(dirname "$0")/.env.deploy"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌  File .env.deploy tidak ditemukan. Copy dari .env.deploy.example dulu."
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED_VARS=(DATABASE_URL NEXTAUTH_URL AUTH_SECRET RESEND_API_KEY EMAIL_FROM OWNER_EMAILS)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "❌  Env var '$var' kosong di .env.deploy"; exit 1
  fi
done

echo "🔨  Building $LOCAL_IMAGE di $DOCKER_HOST..."
docker build -t "$LOCAL_IMAGE" -f "$REPO_ROOT/apps/saas/Dockerfile" "$REPO_ROOT"

BUILD_DATE=$(date +%Y%m%d)
BUILD_HASH=$(git rev-parse --short=5 HEAD 2>/dev/null || echo "00000")
echo "🚀  Deploying $LOCAL_IMAGE → $CONTAINER (version: $BUILD_DATE.$BUILD_HASH)..."

docker stop "$CONTAINER" 2>/dev/null && echo "   stopped $CONTAINER" || true
docker rm   "$CONTAINER" 2>/dev/null && echo "   removed $CONTAINER" || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -p 3300:3000 \
  -e NEXT_PUBLIC_BUILD_DATE="$BUILD_DATE" \
  -e NEXT_PUBLIC_BUILD_HASH="$BUILD_HASH" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_URL="$NEXTAUTH_URL" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}" \
  -e RESEND_API_KEY="$RESEND_API_KEY" \
  -e EMAIL_FROM="$EMAIL_FROM" \
  -e OWNER_EMAILS="$OWNER_EMAILS" \
  -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" \
  -e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
  -e WA_OMNI_URL="${WA_OMNI_URL:-}" \
  -e WA_OMNI_TOKEN="${WA_OMNI_TOKEN:-}" \
  -e WA_OMNI_ACCOUNT_ID="${WA_OMNI_ACCOUNT_ID:-}" \
  -e R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}" \
  -e R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}" \
  -e R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}" \
  -e R2_BUCKET="${R2_BUCKET:-}" \
  "$LOCAL_IMAGE"

echo "⏳  Menunggu container ready..."
sleep 3
if docker logs "$CONTAINER" 2>&1 | grep -q "Ready in"; then
  echo "✅  Deploy berhasil! Container '$CONTAINER' berjalan di :3300."
  docker logs "$CONTAINER" --tail 5
else
  echo "⚠️   Container jalan tapi belum terdeteksi Ready. Cek logs:"
  docker logs "$CONTAINER" --tail 10
fi
