// Test ini butuh Postgres nyala & DATABASE_URL ke-set (dev DB, BUKAN produksi) — di-skip
// otomatis kalau DATABASE_URL absen, supaya `pnpm test` biasa (semua mock) tak ikut kepengaruh.
//
// Kenapa perlu ini di atas unit test mocked di capacity.test.ts: unit test cuma memverifikasi
// getCapacity MEM-PASSING klausa where validUntil/validFrom/active ke findMany — itu tetap lolos
// walau operator SQL-nya salah arah (mis. `gte` padahal seharusnya `lte`). Klausa itu adalah
// gerbang capacity berbayar sesungguhnya, jadi butuh Postgres asli untuk membuktikan semantik
// exclusion-nya benar, bukan cuma bentuk call mock-nya.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("getCapacity — exclusion grant (Postgres asli)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let userId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({ data: { email: `capacity-test-${Date.now()}@test.local` } });
    userId = user.id;
    await prisma.entitlement.create({ data: { userId } });

    // 1. Grant kedaluwarsa (validUntil kemarin) — harus dikecualikan.
    await prisma.slotGrant.create({
      data: {
        userId,
        source: "PROMO",
        quantity: 10,
        active: true,
        validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // 2. Grant future-dated (validFrom besok) — harus dikecualikan.
    await prisma.slotGrant.create({
      data: {
        userId,
        source: "PROMO",
        quantity: 10,
        active: true,
        validFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 3. Grant inactive (active: false, tanpa validFrom/validUntil) — harus dikecualikan.
    await prisma.slotGrant.create({
      data: {
        userId,
        source: "PROMO",
        quantity: 10,
        active: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.slotGrant.deleteMany({ where: { userId } });
    await prisma.entitlement.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("mengecualikan grant kedaluwarsa, future-dated, dan inactive — capacity = baseline saja", async () => {
    const { getCapacity } = await import("./capacity");
    // printer.defaultSlots Config tak di-set di test ini, jadi fallback ke default dokumentasi (1).
    await expect(getCapacity(userId)).resolves.toBe(1);
  });
});
