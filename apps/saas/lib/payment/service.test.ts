import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    entitlement: { update: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    slotGrant: { create: vi.fn() },
    cydVariant: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<any>("@/lib/config");
  return { ...actual, getConfig: vi.fn() };
});
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn() }));
vi.mock("@/lib/qris/dynamic", () => ({ generateDynamicQris: vi.fn(() => "QRPAYLOAD") }));

import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { allocUniqueCode, createOrReuseCheckout, createSlotCheckout, createOrReuseCydCheckout, createOrReuseSubscribeCheckout, markPaid, findClaimablePayment, listPending, activate, cancel, deactivate, listPaid, listCydOrders, updateCydShipping } from "@/lib/payment/service";
import { AlreadyOwned, InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

const NOW = new Date("2026-07-18T10:00:00Z");
beforeEach(() => vi.clearAllMocks());

describe("allocUniqueCode", () => {
  it("lewati kode yang bikin amount tabrakan payment lain (base sama)", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([{ amount: 29000 }, { amount: 29001 }]);
    const code = await allocUniqueCode(29000, NOW);
    expect(code).toBeGreaterThanOrEqual(0);
    expect([0, 1]).not.toContain(code);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", createdAt: { gt: expect.any(Date) }, amount: { gte: 29000, lt: 30000 } }),
      })
    );
  });

  it("payment lain dengan base BEDA tak menghalangi kode, walau code-nya sama", async () => {
    // amount 50500 datang dari base yang beda (misal 50000+500) -- di luar window [29000, 29999] base kita, jadi tak boleh diquery/dianggap tabrakan
    (prisma.payment.findMany as any).mockResolvedValue([]);
    const code = await allocUniqueCode(29000, NOW);
    expect(code).toBeGreaterThanOrEqual(0);
    expect(code).toBeLessThan(1000);
  });
});

describe("createOrReuseCheckout", () => {
  function cfg(map: Record<string, string>) {
    (getConfig as any).mockImplementation(async (k: string) => map[k] ?? "");
  }
  it("lifetimeOwned → AlreadyOwned", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(AlreadyOwned);
  });
  it("ada invoice hidup → reuse (tak create)", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p-existing" });
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.id).toBe("p-existing");
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
  it("price belum diset → PriceNotSet", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "" });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(PriceNotSet);
  });
  it("qris.static kosong → QrisNotSet", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "150000", "qris.static": "" });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(QrisNotSet);
  });
  it("sukses → amount = price − buffer + kode, create PENDING", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]); // semua kode bebas
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.displayPrice).toBe(150000);
    expect(r.amount).toBe(150000 - 1000 + r.uniqueCode);
    expect(r.status).toBe("PENDING");
    expect(r.qrPayload).toBe("QRPAYLOAD");
  });
  it("buffer ≥ price → PriceNotSet", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "1000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(PriceNotSet);
  });
  it("discountBuffer diset di bawah 1000 → di-floor jadi 1000 (amount tetap < displayPrice)", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]); // semua kode bebas
    cfg({ "price.beli": "150000", "price.discountBuffer": "500", "qris.static": "00020101021152...6304ABCD" });
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.amount).toBeLessThan(150000);
    expect(r.amount).toBe(150000 - 1000 + r.uniqueCode);
  });
  it("creates a Payment with productType BELI", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    await createOrReuseCheckout("user-1", NOW);
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productType: "BELI" }) })
    );
  });
  it("pool kode habis (1000 pendents) → CodePoolExhausted", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    // base = price(150000) - buffer(1000) = 149000
    const exhausted = Array.from({ length: 1000 }, (_, i) => ({ amount: 149000 + i }));
    (prisma.payment.findMany as any).mockResolvedValue(exhausted);
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(CodePoolExhausted);
  });
  it("regression: dua base beda gak pernah nabrak walau code sama (fix N1 whole-feature review)", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    // base = 150000 - 1000 = 149000. Simulate one live PENDING payment that ALREADY occupies amount 149500
    // (as if from a different base + different code, e.g. base=149000+code=500, or entirely different base by coincidence).
    (prisma.payment.findMany as any).mockResolvedValue([{ amount: 149500 }]);
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    const r = await createOrReuseCheckout("u1", NOW);
    expect(r.amount).not.toBe(149500);
  });
});

describe("createSlotCheckout", () => {
  it("throws InvalidQuantity for zero, negative, or non-integer quantity", async () => {
    await expect(createSlotCheckout("u1", 0)).rejects.toThrow(InvalidQuantity);
    await expect(createSlotCheckout("u1", -1)).rejects.toThrow(InvalidQuantity);
    await expect(createSlotCheckout("u1", 1.5)).rejects.toThrow(InvalidQuantity);
  });

  it("creates a Payment with productType SLOT_PURCHASE, quantity, and amount = quantity * unitPrice - buffer + code", async () => {
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.slotPerUnit": "10000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]); // allocUniqueCode's live-pending scan
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createSlotCheckout("u1", 3, NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", productType: "SLOT_PURCHASE", quantity: 3, displayPrice: 30000 }),
      })
    );
    expect(p.amount).toBe(30000 - 1000 + (p as any).uniqueCode);
  });

  it("reuses an existing PENDING payment with the same quantity within the live window", async () => {
    const existing = { id: "p-existing", productType: "SLOT_PURCHASE", quantity: 5, status: "PENDING" };
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createSlotCheckout("u1", 5, NOW);

    expect(p).toBe(existing);
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1", productType: "SLOT_PURCHASE", quantity: 5, status: "PENDING" }) })
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("creates a new payment when quantity differs from the existing PENDING one (findFirst filters by quantity, so a mismatch returns null and a new payment is created)", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null); // no PENDING row matches quantity: 7
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.slotPerUnit": "10000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new-2", ...data }));

    await createSlotCheckout("u1", 7, NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 7 }) })
    );
  });

  it("throws PriceNotSet when price.slotPerUnit is unset", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async () => "");
    await expect(createSlotCheckout("u1", 1, NOW)).rejects.toThrow(PriceNotSet);
  });

  it("throws QrisNotSet when qris.static is unset", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async (k: string) => (k === "price.slotPerUnit" ? "10000" : ""));
    await expect(createSlotCheckout("u1", 1, NOW)).rejects.toThrow(QrisNotSet);
  });
});

describe("createOrReuseCydCheckout", () => {
  it("throws InvalidQuantity for zero, negative, or non-integer quantity", async () => {
    await expect(createOrReuseCydCheckout("u1", "variant-1", 0, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
    await expect(createOrReuseCydCheckout("u1", "variant-1", -1, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1.5, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
  });

  it("throws InvalidShippingAddress for empty or whitespace-only address", async () => {
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1, "")).rejects.toThrow(InvalidShippingAddress);
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1, "   ")).rejects.toThrow(InvalidShippingAddress);
  });

  it("throws InvalidCydVariant when the variant doesn't exist or is inactive", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue(null);
    await expect(createOrReuseCydCheckout("u1", "missing-variant", 1, "Jl. Contoh 1")).rejects.toThrow(InvalidCydVariant);

    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: false });
    await expect(createOrReuseCydCheckout("u1", "v1", 1, "Jl. Contoh 1")).rejects.toThrow(InvalidCydVariant);
  });

  it("creates a Payment with productType CYD_PURCHASE, cydVariantId, quantity, shippingAddress, amount = quantity * variant.price - buffer + code", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "CYD dengan casing", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) => ({ "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? "");
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "Jl. Contoh 1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2,
          shippingAddress: "Jl. Contoh 1", displayPrice: 200000,
        }),
      })
    );
    expect(p.amount).toBe(200000 - 1000 + (p as any).uniqueCode);
  });

  it("reuses an existing PENDING payment with the same variant and quantity, updating shippingAddress in place if it changed", async () => {
    const existing = { id: "p-existing", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2, shippingAddress: "Old Address", status: "PENDING" };
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(existing);
    (prisma.payment.update as any).mockImplementation(async ({ data }: any) => ({ ...existing, ...data }));

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "New Address", NOW);

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p-existing" }, data: { shippingAddress: "New Address" } })
    );
    expect(p.shippingAddress).toBe("New Address");
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("reuses without updating when shippingAddress is unchanged", async () => {
    const existing = { id: "p-existing", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2, shippingAddress: "Same Address", status: "PENDING" };
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "Same Address", NOW);

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(p).toBe(existing);
  });

  it("creates a new payment when quantity or variant differs from the existing PENDING one", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null); // no PENDING row matches variant+quantity
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) => ({ "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? "");
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new-2", ...data }));

    await createOrReuseCydCheckout("u1", "v1", 5, "Jl. Contoh 1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 5 }) })
    );
  });

  it("stores shippingAddress trimmed of leading/trailing whitespace", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) => ({ "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? "");
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseCydCheckout("u1", "v1", 1, "  Jl. Contoh 1  ", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shippingAddress: "Jl. Contoh 1" }) })
    );
    expect(p.shippingAddress).toBe("Jl. Contoh 1");
  });

  it("reusing an existing PENDING payment with the same address modulo whitespace does not trigger an update", async () => {
    const existing = { id: "p-existing", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2, shippingAddress: "Jl. Contoh 1", status: "PENDING" };
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "  Jl. Contoh 1  ", NOW);

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(p).toBe(existing);
  });
});

describe("createOrReuseSubscribeCheckout", () => {
  it("uses price.sub.standalone when the user does not own lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseSubscribeCheckout("u1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", productType: "SUBSCRIBE", displayPrice: 50000 }) })
    );
    expect(p.amount).toBe(50000 - 1000 + (p as any).uniqueCode);
  });

  it("uses price.sub.owner (discount) when the user already owns lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    await createOrReuseSubscribeCheckout("u1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayPrice: 35000 }) })
    );
  });

  it("reuses an existing PENDING SUBSCRIBE payment within the live window when the price still matches", async () => {
    const existing = { id: "p-existing", productType: "SUBSCRIBE", status: "PENDING", displayPrice: 50000 };
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createOrReuseSubscribeCheckout("u1", NOW);

    expect(p).toBe(existing);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(getEntitlement).toHaveBeenCalled();
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", productType: "SUBSCRIBE", displayPrice: 50000, status: "PENDING" }),
      })
    );
  });

  it("does not reuse a stale PENDING payment created at an old price (price changed while pending)", async () => {
    // User's price changed to the discounted owner price after buying lifetime Pro;
    // a real Prisma query filtered by displayPrice: 35000 would not find the old
    // standalone-priced PENDING row, so we simulate that here by returning null.
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseSubscribeCheckout("u1", NOW);

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", productType: "SUBSCRIBE", displayPrice: 35000, status: "PENDING" }),
      })
    );
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", productType: "SUBSCRIBE", displayPrice: 35000 }) })
    );
    expect(p.displayPrice).toBe(35000);
  });

  it("throws PriceNotSet when the applicable price key is unset", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async () => "");
    await expect(createOrReuseSubscribeCheckout("u1", NOW)).rejects.toBeInstanceOf(PriceNotSet);
  });

  it("does not throw AlreadyOwned even when the user owns lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    await expect(createOrReuseSubscribeCheckout("u1", NOW)).resolves.toBeDefined();
  });
});

describe("markPaid", () => {
  it("set paidMarkedAt bila payment milik user & PENDING", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p1" });
    await markPaid("p1", "u1", { proofKey: "proofs/p1.jpg", proofType: "image/jpeg" }, NOW);
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { paidMarkedAt: NOW, proofKey: "proofs/p1.jpg", proofType: "image/jpeg" } });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "p1", userId: "u1", status: "PENDING", createdAt: { gt: expect.any(Date) } }),
      })
    );
  });
  it("bukan milik user / tak hidup → throw", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    await expect(markPaid("p1", "u1", { proofKey: "k", proofType: "image/jpeg" }, NOW)).rejects.toThrow();
  });
});

describe("findClaimablePayment", () => {
  it("query id+userId+PENDING+live window, dipakai markPaid internal (guard tak berubah)", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p1", userId: "u1", status: "PENDING" });
    const r = await findClaimablePayment("p1", "u1", NOW);
    expect(r).toEqual({ id: "p1", userId: "u1", status: "PENDING" });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1", status: "PENDING", createdAt: { gt: expect.any(Date) } },
    });
  });
  it("tidak ditemukan/bukan milik user → null", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    expect(await findClaimablePayment("p1", "lain", NOW)).toBeNull();
  });
});

describe("1c-2 markPaid simpan bukti", () => {
  it("menyimpan paidMarkedAt + proofKey + proofType", async () => {
    const now = new Date("2026-07-20T10:00:00Z");
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p1", userId: "u1", status: "PENDING" });
    await markPaid("p1", "u1", { proofKey: "proofs/p1.jpg", proofType: "image/jpeg" }, now);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { paidMarkedAt: now, proofKey: "proofs/p1.jpg", proofType: "image/jpeg" },
    });
  });
  it("tetap tolak payment bukan milik user", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    await expect(markPaid("p1", "lain", { proofKey: "k", proofType: "image/jpeg" })).rejects.toThrow("not_found");
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});

describe("listPending", () => {
  it("query PENDING + (live window OR paidMarkedAt set), orderBy paidMarkedAt desc nulls-last then createdAt desc", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([]);
    await listPending(NOW);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          OR: [
            { createdAt: { gt: expect.any(Date) } },
            { paidMarkedAt: { not: null } },
          ],
        }),
        orderBy: [{ paidMarkedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      }),
    );
  });
  it("invoice ditandai bayar tapi lewat 3 jam tetap muncul (lolos lewat OR paidMarkedAt)", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([]);
    await listPending(NOW);
    const call = (prisma.payment.findMany as any).mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([{ paidMarkedAt: { not: null } }]),
    );
  });
});

describe("activate", () => {
  // activate() sekarang membungkus update+dispatch dalam satu prisma.$transaction; karena method
  // tx yang dipakai (payment.update, entitlement.upsert, slotGrant.create) sama persis dengan yang
  // ada di object prisma mock, tx bisa reuse object prisma itu sendiri (lihat pola serupa di
  // lib/devices/service.test.ts / lib/cyd-layout/service.test.ts).
  beforeEach(() => {
    (prisma.$transaction as any).mockImplementation((fn: any) => fn(prisma));
  });

  it("status bukan PENDING → no-op null (idempoten)", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PAID" });
    expect(await activate("p1", "owner@x.com", NOW)).toBeNull();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
  it("PENDING → set PAID + flip lifetimeOwned", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "BELI" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", userId: "u1", status: "PAID" });
    const r = await activate("p1", "owner@x.com", NOW);
    expect(r?.status).toBe("PAID");
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "PAID", verifiedAt: NOW, verifiedBy: "owner@x.com" } });
    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1" },
      update: { lifetimeOwned: true, lifetimePurchasedAt: NOW },
    }));
  });
  it("productType SLOT_PURCHASE → creates a SlotGrant, does not touch Entitlement", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });

    const result = await activate("p1", "owner@x.com", NOW);

    expect(prisma.slotGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", source: "SLOT_PURCHASE", paymentId: "p1", quantity: 4 }) })
    );
    expect(prisma.entitlement.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "p1", status: "PAID", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });
  });

  it("productType outside the known set still throws (dispatch has a default case)", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SOMETHING_UNKNOWN" });
    await expect(activate("p1", "owner@x.com", NOW)).rejects.toThrow(/unsupported productType/);
  });

  it("SLOT_PURCHASE with null quantity → throws, does not create a SlotGrant", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SLOT_PURCHASE", quantity: null });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "SLOT_PURCHASE", quantity: null });
    await expect(activate("p1", "owner@x.com", NOW)).rejects.toThrow(/invalid quantity/);
    expect(prisma.slotGrant.create).not.toHaveBeenCalled();
  });

  it("productType CYD_PURCHASE → creates a SlotGrant with quantity = payment.quantity * variant.slotBonus", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "CYD_PURCHASE", quantity: 2, cydVariantId: "v1" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "CYD_PURCHASE", quantity: 2, cydVariantId: "v1" });
    (prisma.cydVariant.findUniqueOrThrow as any).mockResolvedValue({ id: "v1", label: "CYD besar", price: 300000, slotBonus: 20, active: true });

    const result = await activate("p1", "owner@x.com", NOW);

    expect(prisma.slotGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", source: "CYD_PURCHASE", paymentId: "p1", quantity: 40 }) })
    );
    expect(prisma.entitlement.upsert).not.toHaveBeenCalled();
    expect(result?.status).toBe("PAID");
  });

  it("productType SUBSCRIBE, first-ever subscribe -> SlotGrant quantity 5, period starts now", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.entitlement.findUnique as any).mockResolvedValue(null);

    await activate("p1", "owner@x.com", NOW);

    expect(prisma.slotGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", source: "SUBSCRIBE", paymentId: "p1", quantity: 5, validFrom: NOW }),
      })
    );
    const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
    expect(call.validUntil.getTime() - call.validFrom.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: "u1", subStatus: "ACTIVE", subStartedAt: NOW }),
        update: expect.objectContaining({ subStatus: "ACTIVE" }),
      })
    );
  });

  it("productType SUBSCRIBE, renewal BEFORE lapse -> new period continues from the old subExpiresAt, no gap", async () => {
    const oldExpiry = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 hari lagi, belum lapse
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p2", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p2", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.entitlement.findUnique as any).mockResolvedValue({ userId: "u1", subStatus: "ACTIVE", subExpiresAt: oldExpiry, subStartedAt: new Date("2026-01-01") });

    await activate("p2", "owner@x.com", NOW);

    const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
    expect(call.validFrom).toEqual(oldExpiry);
    expect(call.validUntil.getTime()).toBe(oldExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.not.objectContaining({ subStartedAt: expect.anything() }) })
    );
  });

  it("productType SUBSCRIBE, renewal AFTER lapse -> new period starts from now, not the stale old expiry", async () => {
    const oldExpiry = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 hari lalu, sudah lapse
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p3", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p3", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
    (prisma.entitlement.findUnique as any).mockResolvedValue({ userId: "u1", subStatus: "ACTIVE", subExpiresAt: oldExpiry, subStartedAt: new Date("2026-01-01") });

    await activate("p3", "owner@x.com", NOW);

    const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
    expect(call.validFrom).toEqual(NOW);
  });
});

describe("listCydOrders", () => {
  it("returns only PAID CYD_PURCHASE payments, including the variant label, capped at 50", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([{ id: "p1", productType: "CYD_PURCHASE", status: "PAID", cydVariant: { label: "CYD dengan casing" } }]);
    const rows = await listCydOrders();
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productType: "CYD_PURCHASE", status: "PAID" },
        take: 50,
        include: { cydVariant: { select: { label: true } } },
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cydVariant?.label).toBe("CYD dengan casing");
  });
});

describe("updateCydShipping", () => {
  it("rejects an unknown shippingStatus value", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "CYD_PURCHASE" });
    await expect(updateCydShipping("p1", { shippingStatus: "LOST_IN_MAIL" })).rejects.toThrow(/invalid_shipping_status/);
  });

  it("rejects a non-CYD payment id", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "BELI" });
    await expect(updateCydShipping("p1", { shippingStatus: "PACKED" })).rejects.toThrow(/not_cyd_payment/);
  });

  it("rejects a non-number shippingCost without reaching prisma.payment.update", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "CYD_PURCHASE" });
    await expect(updateCydShipping("p1", { shippingCost: "abc" })).rejects.toThrow(/invalid_shipping_cost/);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("updates shippingCost and/or shippingStatus for a valid CYD payment", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "CYD_PURCHASE" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", shippingCost: 25000, shippingStatus: "SHIPPED" });
    const updated = await updateCydShipping("p1", { shippingCost: 25000, shippingStatus: "SHIPPED" });
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { shippingCost: 25000, shippingStatus: "SHIPPED" } });
    expect(updated.shippingStatus).toBe("SHIPPED");
  });
});

describe("deactivate", () => {
  it("set lifetimeOwned false", async () => {
    await deactivate("u1");
    expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { lifetimeOwned: false } });
  });
});

describe("cancel", () => {
  it("set CANCELLED", async () => {
    await cancel("p1");
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CANCELLED" } });
  });
});
