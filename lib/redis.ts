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
    console.warn("[redis] connection error:", err.message)
  })
  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis
}

/** Get parsed JSON from Redis, returns null on miss or error */
export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Set JSON in Redis with TTL in seconds, silently ignores errors */
export async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
  } catch {
    // Cache write failure is non-fatal
  }
}

/** Delete a key, silently ignores errors */
export async function redisDel(key: string): Promise<void> {
  try { await redis.del(key) } catch {}
}
