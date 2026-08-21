import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redisConnection: IORedis | undefined };

// maxRetriesPerRequest: null wajib buat BullMQ (dia pakai blocking commands yang gak cocok
// sama retry-limit default ioredis). Reuse Redis homelab yang sudah dipakai apps/dashboard
// (lib/redis.ts), prefix nama queue sendiri (lihat subscribe-reminders.ts) biar gak nabrak.
export const redisConnection =
  globalForRedis.redisConnection ??
  new IORedis(process.env.REDIS_URL ?? "redis://light-generator-redis-1:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisConnection = redisConnection;
}
