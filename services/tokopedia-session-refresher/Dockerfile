FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

ENV COREPACK_INTEGRITY_KEYS=""
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/tokopedia-session-refresher ./services/tokopedia-session-refresher
RUN pnpm install --frozen-lockfile --filter @3pb/tokopedia-session-refresher...

# Binary Camoufox (Firefox anti-deteksi-bot) — bukan Chromium bawaan image ini —
# di-fetch eksplisit (bukan postinstall otomatis), disimpan ke direktori tetap
# supaya path-nya konsisten dan bisa dipakai runtime tanpa fetch ulang tiap start.
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox
RUN cd services/tokopedia-session-refresher && npx camoufox-js fetch

ENV DISPLAY=:99
ENV BROWSER_PROFILE_DIR=/data/browser-profile

COPY services/tokopedia-session-refresher/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 6080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
