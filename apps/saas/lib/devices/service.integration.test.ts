// Test ini butuh Postgres nyala & DATABASE_URL ke-set (dev DB, BUKAN produksi) — di-skip
// otomatis kalau DATABASE_URL absen, supaya `pnpm test` biasa (semua mock) tak ikut kepengaruh.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("createDevice — race condition (Postgres asli)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let userId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({ data: { email: `race-test-${Date.now()}@test.local` } });
    userId = user.id;
    await prisma.entitlement.create({ data: { userId, printerSlots: 1 } });
  });

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { userId } });
    await prisma.entitlement.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("2 create paralel di slot terakhir (limit=1) — cuma 1 yang boleh sukses", async () => {
    const { createDevice } = await import("./service");
    const { SlotLimitExceeded } = await import("./errors");

    const results = await Promise.allSettled([
      createDevice(userId, { label: "A", printerType: "bambu" }),
      createDevice(userId, { label: "B", printerType: "bambu" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotLimitExceeded);

    const finalCount = await prisma.device.count({ where: { userId } });
    expect(finalCount).toBe(1);
  });
});
