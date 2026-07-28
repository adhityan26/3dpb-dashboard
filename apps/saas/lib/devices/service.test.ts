import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    device: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    cydLayout: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/id/short-code", () => ({ generateUniqueShortCode: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfigInt: vi.fn() }));

import { prisma } from "@/lib/db";
import { generateUniqueShortCode } from "@/lib/id/short-code";
import { getConfigInt } from "@/lib/config";
import { listDevices, createDevice, updateDevice, deleteDevice, PRINTER_TYPES } from "./service";
import { SlotLimitExceeded, InvalidPrinterType, DeviceNotFound } from "./errors";

beforeEach(() => vi.clearAllMocks());

describe("listDevices", () => {
  it("balikin device milik user", async () => {
    (prisma.device.findMany as any).mockResolvedValue([{ id: "d1", userId: "u1" }]);
    const result = await listDevices("u1");
    expect(result).toHaveLength(1);
    expect(prisma.device.findMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

describe("createDevice", () => {
  function mockTx(count: number, limit: number | null) {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        entitlement: { findUnique: vi.fn().mockResolvedValue({ printerSlots: limit }) },
        device: {
          count: vi.fn().mockResolvedValue(count),
          create: vi.fn().mockResolvedValue({ id: "new-d", userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567" }),
        },
      };
      return fn(tx);
    });
  }

  it("tolak printerType tak dikenal", async () => {
    await expect(createDevice("u1", { label: "X", printerType: "prusa" })).rejects.toThrow(InvalidPrinterType);
  });

  it("berhasil create kalau count < limit (limit dari Entitlement)", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    mockTx(0, 2);
    const device = await createDevice("u1", { label: "Printer A", printerType: "bambu" });
    expect(device.id).toBe("new-d");
  });

  it("tolak kalau count >= limit eksplisit (Entitlement.printerSlots set)", async () => {
    mockTx(2, 2);
    await expect(createDevice("u1", { label: "Printer A", printerType: "bambu" })).rejects.toThrow(SlotLimitExceeded);
  });

  it("fallback ke Config kalau Entitlement.printerSlots null", async () => {
    (getConfigInt as any).mockResolvedValue(1);
    mockTx(1, null); // limit null di Entitlement -> harus fallback ke Config (1) -> count 1 >= 1 -> reject
    await expect(createDevice("u1", { label: "Printer A", printerType: "bambu" })).rejects.toThrow(SlotLimitExceeded);
    expect(getConfigInt).toHaveBeenCalledWith("printer.defaultSlots", 1);
  });
});

describe("updateDevice", () => {
  it("throw DeviceNotFound kalau device bukan milik user / tak ada", async () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    await expect(updateDevice("u1", "d-x", { label: "Baru" })).rejects.toThrow(DeviceNotFound);
  });

  it("tolak printerType tak dikenal saat update", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    await expect(updateDevice("u1", "d1", { printerType: "prusa" })).rejects.toThrow(InvalidPrinterType);
  });
});

describe("deleteDevice", () => {
  it("hapus device + bersihkan cell layout yang mereferensikan shortCode-nya, dalam 1 transaksi", async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        device: {
          findUnique: vi.fn().mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" }),
          delete: vi.fn().mockResolvedValue({}),
        },
        cydLayout: {
          findUnique: vi.fn().mockResolvedValue({
            userId: "u1",
            config: { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "abc1234567", col: 0, row: 0 }] }] },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    await deleteDevice("u1", "d1");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("throw DeviceNotFound kalau device bukan milik user", async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = { device: { findUnique: vi.fn().mockResolvedValue(null) } };
      return fn(tx);
    });
    await expect(deleteDevice("u1", "d-x")).rejects.toThrow(DeviceNotFound);
  });
});

describe("PRINTER_TYPES", () => {
  it("cuma bambu & moonraker", () => {
    expect(PRINTER_TYPES).toEqual(["bambu", "moonraker"]);
  });
});
