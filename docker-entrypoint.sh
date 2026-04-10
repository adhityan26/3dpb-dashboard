#!/bin/sh
set -e

echo "[entrypoint] Running Prisma migrations..."
npx prisma migrate deploy 2>&1 || echo "[entrypoint] Migration skipped or failed (may be first run)"

echo "[entrypoint] Starting Next.js server..."
exec node server.js
