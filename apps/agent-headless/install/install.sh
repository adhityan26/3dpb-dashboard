#!/usr/bin/env bash
# apps/agent-headless/install.sh
set -euo pipefail

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "Error: slizebiz-agent hanya mendukung arm64 (Raspberry Pi 4/5). Arsitektur terdeteksi: $ARCH" >&2
  exit 1
fi

RELEASE_URL="${SLIZEBIZ_AGENT_RELEASE_URL:-https://releases.slizebiz.com/agent-headless/latest/agent-headless-linux-arm64.tar.gz}"
INSTALL_ROOT="/opt/slizebiz-agent"
DATA_DIR="/var/lib/slizebiz-agent"
SERVICE_USER="slizebiz-agent"

echo "==> Mengunduh rilis dari $RELEASE_URL"
VERSION_DIR="$INSTALL_ROOT/releases/$(date +%Y%m%d%H%M%S)"
sudo mkdir -p "$VERSION_DIR"
curl -fsSL "$RELEASE_URL" | sudo tar -xz -C "$VERSION_DIR"

echo "==> Membuat user sistem $SERVICE_USER (kalau belum ada)"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> Memasang symlink current -> rilis baru"
sudo ln -sfn "$VERSION_DIR" "$INSTALL_ROOT/current"

echo "==> Memasang systemd unit"
sudo cp "$VERSION_DIR/install/slizebiz-agent.service" /etc/systemd/system/slizebiz-agent.service
sudo systemctl daemon-reload
sudo systemctl enable slizebiz-agent
sudo systemctl restart slizebiz-agent

echo "==> Menunggu daemon sehat..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
    echo "Daemon sehat."
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Error: daemon tidak merespons /healthz setelah 30 detik. Cek: sudo journalctl -u slizebiz-agent -n 50" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Menyiapkan API token"
TOKEN="$(sudo -u "$SERVICE_USER" node "$INSTALL_ROOT/current/dist/index.mjs" --print-token)"
echo "$TOKEN" | sudo tee "$DATA_DIR/api-token" >/dev/null
sudo chown "root:$SERVICE_USER" "$DATA_DIR/api-token"
sudo chmod 0640 "$DATA_DIR/api-token"

IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "=========================================="
echo "Instalasi selesai."
echo "URL:   http://$IP:8080"
echo "Token: $TOKEN"
echo "(token juga tersimpan di $DATA_DIR/api-token, permission 0640 root:$SERVICE_USER)"
echo "=========================================="
