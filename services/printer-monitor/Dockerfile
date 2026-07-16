FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/printer-monitor-core ./packages/printer-monitor-core
COPY services/printer-monitor ./services/printer-monitor
RUN pnpm install --frozen-lockfile --filter @3pb/printer-monitor...
ENV CONFIG_PATH=/data/config.json
CMD ["pnpm", "--filter", "@3pb/printer-monitor", "start"]
