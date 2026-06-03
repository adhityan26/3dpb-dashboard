# Redis Cache Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all in-memory module-level caches with Redis (ioredis), using the existing `light-generator-redis-1` container on the `homelab` Docker network.

**Architecture:** Install `ioredis`, create `lib/redis.ts` singleton (same `globalThis` pattern as `lib/db.ts`), replace `_cache` and `_soldStatsCache` in `lib/products/service.ts` with Redis JSON strings (TTL via `SET EX`). Graceful fallback: if Redis unavailable, log warning and skip cache (never crash).

**Tech Stack:** ioredis, Next.js App Router, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/redis.ts` | Create | Redis singleton client, same globalThis pattern as db.ts |
| `.env.deploy.example` | Modify | Add `REDIS_URL` example |
| `deploy.sh` | Modify | Pass `REDIS_URL` env var to container |
| `lib/products/service.ts` | Modify | Replace `_cache` + `_soldStatsCache` with Redis |

---

### Task 1: Install ioredis + create Redis client singleton

**Files:**
- Modify: `package.json` (via npm install)
- Create: `lib/redis.ts`

- [ ] **Step 1: Install ioredis**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm install ioredis
npm install --save-dev @types/ioredis 2>/dev/null || true
```

Expected: `ioredis` appears in `package.json` dependencies.

- [ ] **Step 2: Create lib/redis.ts**

```typescript
import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? "redis://light-generator-redis-1:6379"
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
  })
  client.on("error", (err) => {
    // Log but never crash — cache miss is acceptable
    console.warn("[redis] connection error:", err.message)
  })
  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis
}

/** Helper: get parsed JSON from Redis, returns null on miss or error */
export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Helper: set JSON in Redis with TTL in seconds, silently ignores errors */
export async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
  } catch {
    // Cache write failure is not fatal
  }
}

/** Helper: delete a key, silently ignores errors */
export async function redisDel(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch {}
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 4: Commit**

```bash
git add lib/redis.ts package.json package-lock.json
git commit -m "feat(infra): add ioredis client singleton with graceful fallback"
```

---

### Task 2: Add REDIS_URL to env config + deploy.sh

**Files:**
- Modify: `.env.deploy.example`
- Modify: `deploy.sh`

- [ ] **Step 1: Add to .env.deploy.example**

Read `.env.deploy.example` first, then append after the last line:

```bash
# Redis (for caching — default connects to light-generator-redis-1 on homelab network)
REDIS_URL=redis://light-generator-redis-1:6379
```

- [ ] **Step 2: Add to deploy.sh**

Read `deploy.sh` first. Find the `-e STL_SERVICE_TOKEN` line (near the end of `docker run` args) and add after it:

```bash
  -e REDIS_URL="${REDIS_URL:-redis://light-generator-redis-1:6379}" \
```

- [ ] **Step 3: Add to .env.deploy (local)**

```bash
echo 'REDIS_URL=redis://light-generator-redis-1:6379' >> .env.deploy
```

- [ ] **Step 4: Commit**

```bash
git add .env.deploy.example deploy.sh
git commit -m "feat(infra): add REDIS_URL env var to deploy config"
```

---

### Task 3: Replace _cache (full products list) with Redis

**Files:**
- Modify: `lib/products/service.ts`

Context: Currently `_cache` stores `ProductsListResult` in-memory with stale-while-revalidate logic (5-min fresh, 30-min stale). Replace with Redis keys:
- `products:full` → JSON of `ProductsListResult`
- TTL: 300 seconds (5 min fresh) — stale-while-revalidate done via background fetch check at 1800s

Read `lib/products/service.ts` first (lines 1-35 and 475-510) to understand exact current structure.

- [ ] **Step 1: Add redis import to service.ts**

At the top of `lib/products/service.ts`, add to existing imports:
```typescript
import { redisGet, redisSet, redisDel } from "@/lib/redis"
```

- [ ] **Step 2: Remove in-memory cache variables**

Delete these lines (around lines 18-33):
```typescript
// ── In-process cache (stale-while-revalidate) ─────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes: serve from cache, refresh in bg
const STALE_TTL_MS = 30 * 60 * 1000 // 30 minutes: max age before forcing fresh

interface CacheEntry {
  data: ProductsListResult
  cachedAt: number
  refreshing: boolean
}

let _cache: CacheEntry | null = null

/** Invalidate cache (call after stock/HPP mutations). */
export function invalidateProductsCache() {
  _cache = null
}
```

Replace with:
```typescript
const PRODUCTS_CACHE_KEY = "products:full"
const PRODUCTS_CACHE_TTL = 300       // 5 min fresh
const PRODUCTS_STALE_TTL = 1800      // 30 min stale

/** Invalidate products cache in Redis. */
export async function invalidateProductsCache(): Promise<void> {
  await redisDel(PRODUCTS_CACHE_KEY)
}
```

- [ ] **Step 3: Replace getProducts() body**

Find the `export async function getProducts()` function (around line 475+). Replace its body:

```typescript
export async function getProducts(): Promise<ProductsListResult> {
  // Try cache first
  const cached = await redisGet<ProductsListResult & { _cachedAt: number; _refreshing?: boolean }>(PRODUCTS_CACHE_KEY)

  if (cached) {
    const age = (Date.now() / 1000) - cached._cachedAt
    if (age < PRODUCTS_CACHE_TTL) {
      return cached  // fresh
    }
    if (age < PRODUCTS_STALE_TTL) {
      // Stale but usable — serve and kick off background refresh
      if (!cached._refreshing) {
        // Mark refreshing to prevent stampede
        await redisSet(PRODUCTS_CACHE_KEY, { ...cached, _refreshing: true }, PRODUCTS_STALE_TTL)
        fetchProductsFresh()
          .then(data => redisSet(PRODUCTS_CACHE_KEY, { ...data, _cachedAt: Math.floor(Date.now() / 1000), _refreshing: false }, PRODUCTS_STALE_TTL))
          .catch(() => {})
      }
      return cached
    }
  }

  // Cache miss or too stale — fetch fresh
  const data = await fetchProductsFresh()
  await redisSet(PRODUCTS_CACHE_KEY, { ...data, _cachedAt: Math.floor(Date.now() / 1000), _refreshing: false }, PRODUCTS_STALE_TTL)
  return data
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 5: Commit**

```bash
git add lib/products/service.ts
git commit -m "feat(cache): migrate products:full cache to Redis"
```

---

### Task 4: Replace _soldStatsCache with Redis

**Files:**
- Modify: `lib/products/service.ts`

Context: `_soldStatsCache` stores `Map<string, SoldStats>` — but Map is not JSON-serializable. Store as `Record<string, SoldStats>` in Redis and convert back on read.

Redis key: `products:sold-stats`, TTL: 1800 seconds (30 min)

- [ ] **Step 1: Remove in-memory soldStats cache variables**

Find and delete (around line 249+):
```typescript
// ── Sold stats cache (30-min TTL, shared across page requests) ────────────
let _soldStatsCache: { data: Map<string, SoldStats>; cachedAt: number } | null = null
const SOLD_STATS_TTL = 30 * 60 * 1000

async function getCachedSoldStats(): Promise<Map<string, SoldStats>> {
  const now = Date.now()
  if (_soldStatsCache && now - _soldStatsCache.cachedAt < SOLD_STATS_TTL) {
    return _soldStatsCache.data
  }
  const data = await getSoldStatsPerItem()
  _soldStatsCache = { data, cachedAt: now }
  return data
}
```

Replace with:
```typescript
const SOLD_STATS_CACHE_KEY = "products:sold-stats"
const SOLD_STATS_TTL = 1800  // 30 min

async function getCachedSoldStats(): Promise<Map<string, SoldStats>> {
  const cached = await redisGet<Record<string, SoldStats>>(SOLD_STATS_CACHE_KEY)
  if (cached) {
    return new Map(Object.entries(cached))
  }
  const data = await getSoldStatsPerItem()
  const record = Object.fromEntries(data)
  await redisSet(SOLD_STATS_CACHE_KEY, record, SOLD_STATS_TTL)
  return data
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 3: Commit**

```bash
git add lib/products/service.ts
git commit -m "feat(cache): migrate sold-stats cache to Redis"
```

---

### Task 5: Cache getProductsPage results in Redis

**Files:**
- Modify: `lib/products/service.ts`

Context: `getProductsPage` currently queries Postgres on every request. Cache per-page results with key `products:page:{page}:{limit}:{q}:{status}`, TTL 300s (5 min). Invalidate all `products:page:*` keys when `syncProductIndex` runs.

- [ ] **Step 1: Add page cache to getProductsPage**

Read `lib/products/service.ts`. Find `export async function getProductsPage`. At the start of the function body (after extracting `{ page, limit, q, status }` from opts), add:

```typescript
// Cache key based on query params
const pageKey = `products:page:${page}:${limit}:${q ?? ""}:${status ?? ""}`
const pageCached = await redisGet<import("./types").ProductsPageResult>(pageKey)
if (pageCached) return pageCached
```

Then at the end of the function, before `return`, add:

```typescript
const result = { products, total, page, totalPages, fetchedAt: new Date().toISOString() }
await redisSet(pageKey, result, 300)  // 5 min TTL
return result
```

Remove the existing `return { products, total, page, totalPages, fetchedAt: ... }` line.

- [ ] **Step 2: Invalidate page cache when syncing index**

Find `export async function syncProductIndex`. At the start of its body, add:

```typescript
// Invalidate all cached pages — index data is about to change
const pageKeys = await redis.keys("products:page:*")
if (pageKeys.length > 0) await redis.del(...pageKeys)
```

Add `redis` to imports at top of service.ts if not already there:
```typescript
import { redisGet, redisSet, redisDel, redis } from "@/lib/redis"
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 4: Commit**

```bash
git add lib/products/service.ts
git commit -m "feat(cache): cache getProductsPage results in Redis, invalidate on sync"
```

---

### Task 6: Deploy + verify Redis connection

**Files:**
- No code changes

- [ ] **Step 1: Deploy**

```bash
./deploy.sh
```

- [ ] **Step 2: Verify Redis is being used**

```bash
# After deploy, check container logs for any Redis errors
docker -H tcp://192.168.88.113:2375 logs shopee-dashboard --tail 30 2>&1 | grep -i redis
```

Expected: no `[redis] connection error` lines.

- [ ] **Step 3: Verify cache works via Redis CLI**

```bash
# Connect to Redis and check keys after opening the Produk page
docker -H tcp://192.168.88.113:2375 exec light-generator-redis-1 redis-cli KEYS "products:*"
```

Expected after browsing Produk page: `products:full`, `products:sold-stats`, dan `products:page:*` keys appear.

- [ ] **Step 4: Verify TTL is set**

```bash
docker -H tcp://192.168.88.113:2375 exec light-generator-redis-1 redis-cli TTL "products:sold-stats"
docker -H tcp://192.168.88.113:2375 exec light-generator-redis-1 redis-cli TTL "products:page:1:20::"
```

Expected: numbers between 1–1800 and 1–300 respectively (not -1 or -2).
