import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
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
import { allocUniqueCode, createOrReuseCheckout, markPaid } from "@/lib/payment/service";
import { AlreadyOwned, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

const NOW = new Date("2026-07-18T10:00:00Z");
beforeEach(() => vi.clearAllMocks());

describe("allocUniqueCode", () => {
  it("lewati kode yang dipakai payment hidup", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([{ uniqueCode: 0 }, { uniqueCode: 1 }]);
    const code = await allocUniqueCode(NOW);
    expect(code).toBeGreaterThanOrEqual(0);
    expect([0, 1]).not.toContain(code);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", createdAt: { gt: expect.any(Date) } }),
      })
    );
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
  it("pool kode habis (1000 pendents) → CodePoolExhausted", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    cfg({ "price.beli": "150000", "price.discountBuffer": "1000", "qris.static": "00020101021152...6304ABCD" });
    const exhausted = Array.from({ length: 1000 }, (_, i) => ({ uniqueCode: i }));
    (prisma.payment.findMany as any).mockResolvedValue(exhausted);
    await expect(createOrReuseCheckout("u1", NOW)).rejects.toBeInstanceOf(CodePoolExhausted);
  });
});

describe("markPaid", () => {
  it("set paidMarkedAt bila payment milik user & PENDING", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ id: "p1" });
    await markPaid("p1", "u1", NOW);
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { paidMarkedAt: NOW } });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "p1", userId: "u1", status: "PENDING", createdAt: { gt: expect.any(Date) } }),
      })
    );
  });
  it("bukan milik user / tak hidup → throw", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    await expect(markPaid("p1", "u1", NOW)).rejects.toThrow();
  });
});
