FROM node:22-bookworm
WORKDIR /app

# node:22-bookworm (plain Debian 12, bukan mcr.microsoft.com/playwright) — base image
# Playwright resmi diketahui punya masalah GLIBC di jammy/noble (microsoft/playwright#37435)
# yang menyebabkan native addon (better-sqlite3, dependency camoufox-js) segfault saat
# di-load meski sudah dikompilasi ulang dari source di environment itu sendiri. Debian
# bookworm vanilla dipakai semua contoh Docker Camoufox yang terbukti jalan di komunitas.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify \
    build-essential python3 \
    libgtk-3-0 libasound2 libx11-xcb1 libdbus-glib-1-2 libgbm1 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/tokopedia-session-refresher ./services/tokopedia-session-refresher
RUN pnpm install --frozen-lockfile --filter @3pb/tokopedia-session-refresher...

# Binary Camoufox (Firefox anti-deteksi-bot) — di-fetch eksplisit (bukan postinstall
# otomatis), disimpan ke direktori tetap supaya path-nya konsisten dan bisa dipakai
# runtime tanpa fetch ulang tiap start.
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox
RUN cd services/tokopedia-session-refresher && npx camoufox-js fetch

ENV DISPLAY=:99
ENV BROWSER_PROFILE_DIR=/data/browser-profile

COPY services/tokopedia-session-refresher/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 6080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
