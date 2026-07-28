#!/bin/bash
# deploy.sh — Deploy tokopedia-session-refresher ke Docker host homelab
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="tokopedia-session-refresher"
IMAGE="tokopedia-session-refresher:latest"

echo "🔨  Building image..."
DOCKER_HOST="$DOCKER_HOST" docker build -f "$REPO_ROOT/services/tokopedia-session-refresher/Dockerfile" -t "$IMAGE" "$REPO_ROOT"

echo "🛑  Stopping old container (if any)..."
DOCKER_HOST="$DOCKER_HOST" docker rm -f "$CONTAINER" 2>/dev/null || true

echo "🚀  Starting container..."
DOCKER_HOST="$DOCKER_HOST" docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -p 6080:6080 \
  -v tokopedia-refresher-profile:/data/browser-profile \
  --env-file "$REPO_ROOT/services/tokopedia-session-refresher/.env.deploy" \
  "$IMAGE"

echo "✅  Deployed. VNC: http://192.168.88.113:6080/vnc.html"
