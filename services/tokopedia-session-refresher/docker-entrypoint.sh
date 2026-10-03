#!/bin/bash
set -e

DISPLAY_NUM="${DISPLAY#:}"
# Sisa socket dari boot sebelumnya (container di-restart, bukan direcreate — /tmp tidak
# ikut bersih) membuat Xvfb menolak start ("Server is already active for display") tanpa
# error yang terlihat karena proses ini di-background — hapus dulu supaya Xvfb baru bisa
# benar-benar bind, bukan cuma numpang file lock lama yang sudah mati.
# File lock /tmp/.X<N>-lock juga WAJIB dihapus: isinya PID lama, dan di container yang
# baru di-restart PID itu bisa kebetulan dipakai proses lain, jadi Xvfb menganggap
# display masih aktif lalu keluar diam-diam (insiden 2026-10-04: "cannot open display :99",
# x11vnc ikut mati, refresh sesi Tokopedia gagal terus sampai lock dihapus manual).
rm -f "/tmp/.X11-unix/X${DISPLAY_NUM}" "/tmp/.X${DISPLAY_NUM}-lock"

echo "[entrypoint] Starting Xvfb on display $DISPLAY..."
Xvfb $DISPLAY -screen 0 1280x800x24 &
for i in $(seq 1 30); do
  # xdpyinfo memverifikasi display benar-benar menjawab request X11, bukan cuma
  # mengecek file socket ada (yang bisa jadi stale/palsu-positif seperti di atas).
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
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
