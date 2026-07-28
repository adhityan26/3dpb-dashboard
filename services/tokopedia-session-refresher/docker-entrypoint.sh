#!/bin/bash
set -e

echo "[entrypoint] Starting Xvfb on display $DISPLAY..."
Xvfb $DISPLAY -screen 0 1280x800x24 &
DISPLAY_NUM="${DISPLAY#:}"
for i in $(seq 1 30); do
  if [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
    echo "[entrypoint] Xvfb ready after ${i}00ms"
    break
  fi
  sleep 0.1
done

echo "[entrypoint] Starting x11vnc..."
x11vnc -display $DISPLAY -forever -nopw -quiet -rfbport 5900 &
sleep 1

echo "[entrypoint] Starting noVNC on :6080..."
websockify --web=/usr/share/novnc 6080 localhost:5900 &

echo "[entrypoint] Starting tokopedia-session-refresher..."
cd /app
exec pnpm --filter @3pb/tokopedia-session-refresher start
