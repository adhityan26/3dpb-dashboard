# ── Stage 1: Build (monorepo, pnpm via corepack) ─────────────────────────────
FROM node:22-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# better-sqlite3 (dep Prisma, dipakai apps/dashboard tapi ikut ter-install krn lockfile
# monorepo bersama) fallback compile dari source kalau fetch prebuilt binary gagal --
# alpine tidak punya toolchain ini secara default. Pola sama persis apps/dashboard/Dockerfile.
RUN apk add --no-cache python3 make g++
# node-gyp defaultnya coba download header Node dari unofficial-builds.nodejs.org saat
# compile from source -- sering timeout di jaringan homelab. node:22-alpine sudah
# menyertakan header itu secara lokal di /usr/local/include/node, jadi arahkan node-gyp
# ke situ supaya skip fetch jaringan sama sekali.
ENV npm_config_nodedir=/usr/local
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @3pb/saas exec prisma generate
RUN pnpm --filter @3pb/saas build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/saas/.next/standalone ./
COPY --from=builder /repo/apps/saas/.next/static ./apps/saas/.next/static
COPY --from=builder /repo/apps/saas/public ./apps/saas/public

COPY --from=builder /repo/apps/saas/prisma ./apps/saas/prisma
COPY --from=builder /repo/apps/saas/prisma.config.ts ./apps/saas/prisma.config.ts

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/saas/node_modules ./apps/saas/node_modules

COPY --from=builder /repo/apps/saas/docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["./docker-entrypoint.sh"]
