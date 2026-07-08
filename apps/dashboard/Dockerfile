# ── Stage 1: Build (monorepo, pnpm via corepack) ─────────────────────────────
FROM node:22-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

# Generate Prisma client (dibutuhkan saat build untuk type checking)
RUN pnpm --filter shopee-dashboard exec prisma generate

# Build Next.js standalone
RUN pnpm --filter shopee-dashboard build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output (layout monorepo: server.js ada di apps/dashboard/)
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /repo/apps/dashboard/public ./apps/dashboard/public

# Prisma schema + migrations (untuk `prisma migrate deploy` di entrypoint)
COPY --from=builder /repo/apps/dashboard/prisma ./apps/dashboard/prisma
COPY --from=builder /repo/apps/dashboard/prisma.config.ts ./apps/dashboard/prisma.config.ts

# Full node_modules untuk prisma CLI + seed script (pola sama seperti sebelumnya).
# Symlink pnpm relatif, jadi copy root + app node_modules mempertahankan resolusi.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/dashboard/node_modules ./apps/dashboard/node_modules

COPY --from=builder /repo/apps/dashboard/scripts ./apps/dashboard/scripts
COPY --from=builder /repo/apps/dashboard/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
