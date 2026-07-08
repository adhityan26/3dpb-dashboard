#!/bin/sh
set -e

cd /app/apps/dashboard

echo "[entrypoint] Pushing Prisma schema to database..."
npx prisma db push --accept-data-loss 2>&1 || echo "[entrypoint] Schema push failed (may already be in sync)"

echo "[entrypoint] Starting Next.js server..."
exec node /app/apps/dashboard/server.js
