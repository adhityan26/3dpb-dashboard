# ── Stage 1: Build (monorepo, pnpm via corepack) ─────────────────────────────
FROM node:22-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# better-sqlite3 (dep Prisma) fallback compile dari source kalau fetch prebuilt binary
# gagal — alpine tidak punya toolchain ini secara default.
# Cache mount: apk package cache persists across builds (BuildKit only).
# --no-cache is dropped and --cache-dir points at the mount explicitly —
# this base image has no /etc/apk/cache symlink by default, so apk won't
# populate a cache dir unless told to. The mount keeps the final image
# clean regardless, since /var/cache/apk isn't part of the committed layer.
RUN --mount=type=cache,target=/var/cache/apk \
    apk update --cache-dir=/var/cache/apk && \
    apk add --cache-dir=/var/cache/apk python3 make g++
# node-gyp defaultnya coba download header Node dari unofficial-builds.nodejs.org
# saat compile from source — sering timeout di jaringan homelab. node:22-alpine
# sudah menyertakan header itu secara lokal di /usr/local/include/node, jadi arahkan
# node-gyp ke situ supaya skip fetch jaringan sama sekali.
ENV npm_config_nodedir=/usr/local
WORKDIR /repo

# Layer caching: download dependensi hanya dari lockfile, sebelum COPY . .
# — perubahan source code tidak menginvalidasi layer fetch ini.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Force optional-dependency resolution (e.g. @next/swc-linux-x64-*) to the
# musl variant this alpine image actually needs — appended to the copy of
# .npmrc INSIDE the image only, never the repo's real .npmrc (which must
# stay platform-agnostic for local dev on non-linux/non-musl machines).
RUN printf '\nsupportedArchitectures.os=linux\nsupportedArchitectures.cpu=x64\nsupportedArchitectures.libc=musl\n' >> .npmrc
# Cache mount: pnpm's content-addressable store persists across builds
# (BuildKit only) — a source-only change no longer re-downloads every
# package, only re-links from the local store.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm fetch

COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline

# Generate Prisma client (dibutuhkan saat build untuk type checking)
RUN pnpm --filter shopee-dashboard exec prisma generate

# Build Next.js standalone
RUN pnpm --filter shopee-dashboard build

# Prod-only node_modules for the runner stage. Next's standalone output
# already bundles a correctly-traced node_modules for the Next.js server
# itself, but the entrypoint separately shells out to `prisma`/`tsx` CLIs
# (not part of Next's import graph, so not traced) — those + their deps
# need to come from here. `pnpm deploy` resolves prod deps only for the
# target package, scoped correctly (not the whole monorepo). --legacy is
# required because this workspace doesn't set inject-workspace-packages.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter shopee-dashboard deploy --prod --legacy /prod-deps

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

# Prisma schema + migrations (untuk `prisma db push` di entrypoint)
COPY --from=builder /repo/apps/dashboard/prisma ./apps/dashboard/prisma
COPY --from=builder /repo/apps/dashboard/prisma.config.ts ./apps/dashboard/prisma.config.ts

# Prod-only node_modules (see the `pnpm deploy` step in the builder stage)
# for the entrypoint's `prisma`/`tsx` CLI calls — NOT the full monorepo
# node_modules, which was ~1.7GB and included every workspace's devDeps.
COPY --from=builder /prod-deps/node_modules ./node_modules
COPY --from=builder /repo/apps/dashboard/node_modules ./apps/dashboard/node_modules

COPY --from=builder /repo/apps/dashboard/scripts ./apps/dashboard/scripts
COPY --from=builder /repo/apps/dashboard/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
