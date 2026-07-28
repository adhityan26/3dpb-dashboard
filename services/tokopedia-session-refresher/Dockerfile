FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/tokopedia-session-refresher ./services/tokopedia-session-refresher
RUN pnpm install --frozen-lockfile --filter @3pb/tokopedia-session-refresher...

ENV DISPLAY=:99
ENV BROWSER_PROFILE_DIR=/data/browser-profile

COPY services/tokopedia-session-refresher/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 6080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
