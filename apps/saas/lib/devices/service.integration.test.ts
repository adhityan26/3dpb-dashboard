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

// Finding C (code review): `SELECT ... FOR UPDATE` on zero matching rows takes no lock at all.
// Entitlement rows are created best-effort (and silently swallowed on failure) in lib/auth.ts /
// lib/wa/session.ts, so a user without one — exactly the new/Free-tier population where the
// printer.defaultSlots fallback matters most — previously had ZERO race protection. This needs
// real Postgres (not the mocked unit test) because the fix is an atomic
// `INSERT ... ON CONFLICT DO NOTHING`-then-lock sequence whose correctness under concurrency
// can't be meaningfully exercised by mocks that just resolve promises in call order — only a
// real transaction/lock demonstrates it actually serializes. (Two other approaches — a plain
// `upsert()` inside the transaction, and `create()` + catch-P2002 — were tried first and BOTH
// failed against this same real Postgres instance: see the long comment on createDevice in
// service.ts for the reproduction details.)
describe.skipIf(!hasDb)("createDevice — race condition SEM Entitlement row (Postgres asli, Finding C)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let userId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const user = await prisma.user.create({ data: { email: `race-test-noent-${Date.now()}@test.local` } });
    userId = user.id;
    // Sengaja TIDAK membuat baris Entitlement — createDevice harus memastikan satu ADA sendiri
    // (INSERT ... ON CONFLICT DO NOTHING) sebelum mengambil row-lock. Limit yang berlaku jadi
    // fallback Config (printer.defaultSlots, default 1).
  });

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { userId } });
    await prisma.entitlement.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("2 create paralel buat user TANPA Entitlement row — cuma 1 yang boleh sukses (limit fallback Config)", async () => {
    const before = await prisma.entitlement.findUnique({ where: { userId } });
    expect(before).toBeNull(); // pastikan memang belum ada baris sebelum test

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

    // createDevice harus sudah memastikan baris Entitlement-nya ADA di sepanjang jalan.
    const after = await prisma.entitlement.findUnique({ where: { userId } });
    expect(after).not.toBeNull();
  });
});
