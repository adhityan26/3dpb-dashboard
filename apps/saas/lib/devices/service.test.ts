import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    device: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    entitlement: { findUnique: vi.fn() },
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
import { listDevices, createDevice, updateDevice, updateDeviceModelByShortCode, deleteDevice, getDeviceLimit, PRINTER_TYPES } from "./service";
import { SlotLimitExceeded, InvalidPrinterType, InvalidDeviceModel, DeviceNotFound } from "./errors";

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
  // Hoisted (bukan dibuat & dibuang di dalam mockImplementation) supaya test bisa assert
  // langsung ke method-method tx-nya — termasuk urutan panggilan (lihat test row-lock di bawah).
  function mockTx(count: number, limit: number | null) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      entitlement: {
        findUnique: vi.fn().mockResolvedValue({ printerSlots: limit }),
      },
      device: {
        count: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue({ id: "new-d", userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567" }),
      },
    };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    return tx;
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

  // Finding A (code review): mutation-testing membuktikan tanpa test ini, menghapus baris
  // `FOR UPDATE` dari createDevice tetap lolos 10/10 test lama. Test ini memverifikasi row-lock
  // BENAR-BENAR diambil (bukan cuma di-comment sebagai niat baik) dan diambil SEBELUM count.
  it("ambil row-lock (FOR UPDATE) sebelum COUNT devices", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);

    await createDevice("u1", { label: "Printer A", printerType: "bambu" });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sqlParts = (tx.$queryRaw as any).mock.calls[0][0] as TemplateStringsArray;
    expect(Array.from(sqlParts).join("")).toContain("FOR UPDATE");

    const lockCallOrder = (tx.$queryRaw as any).mock.invocationCallOrder[0];
    const countCallOrder = (tx.device.count as any).mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(countCallOrder);
  });

  // Finding C: SELECT ... FOR UPDATE pada 0 baris tidak mengunci apa pun — user tanpa baris
  // Entitlement (umum untuk user baru/Free-tier, lihat lib/auth.ts) punya nol proteksi race kalau
  // baris itu belum dipastikan ADA dulu. Dua pendekatan lain sudah dicoba & gagal di Postgres
  // asli (lihat komentar panjang di service.ts): `upsert()` di dalam interactive transaction
  // ternyata non-atomik (SELECT+INSERT terpisah di client), dan `create()` + catch P2002 GAGAL
  // beda cara — Postgres meng-abort seluruh transaksi begitu satu statement error, jadi statement
  // row-lock berikutnya ikut gagal (`25P02`) walau exception-nya "ditangkap" di JS. Fix final:
  // raw SQL `INSERT ... ON CONFLICT DO NOTHING` — atomik & TIDAK PERNAH error, jadi tak butuh
  // try/catch. Verifikasi urutan: $executeRaw (upsert-nothing) SEBELUM row-lock diambil.
  it("pastikan baris Entitlement ADA (INSERT ... ON CONFLICT DO NOTHING) dulu sebelum ambil row-lock", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);

    await createDevice("u1", { label: "Printer A", printerType: "bambu" });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const sqlParts = (tx.$executeRaw as any).mock.calls[0][0] as TemplateStringsArray;
    const sql = Array.from(sqlParts).join("");
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO NOTHING");

    const insertCallOrder = (tx.$executeRaw as any).mock.invocationCallOrder[0];
    const lockCallOrder = (tx.$queryRaw as any).mock.invocationCallOrder[0];
    expect(insertCallOrder).toBeLessThan(lockCallOrder);
  });

  // Finding D: getConfigInt lewat koneksi prisma global (bukan tx) — kalau dipanggil dari
  // DALAM transaksi yang sedang pegang FOR UPDATE, request lain yang antre di lock itu bisa
  // starvation di connection pool / P2028 timeout. Verifikasi dipanggil SEBELUM $transaction dibuka.
  it("resolve fallback limit (getConfigInt) SEBELUM $transaction dibuka, bukan di dalamnya", async () => {
    (getConfigInt as any).mockResolvedValue(1);
    mockTx(0, 2); // Entitlement.printerSlots di-set (2) supaya fallback tak dipakai buat limit,
    // tapi getConfigInt tetap dipanggil unconditionally sebelum transaksi (lihat implementasi).

    await createDevice("u1", { label: "Printer A", printerType: "bambu" });

    const configCallOrder = (getConfigInt as any).mock.invocationCallOrder[0];
    const txCallOrder = (prisma.$transaction as any).mock.invocationCallOrder[0];
    expect(configCallOrder).toBeLessThan(txCallOrder);
  });

  // Final review Finding 2: sama semangatnya dengan test getConfigInt di atas, tapi kebalikannya —
  // generateUniqueShortCode TIDAK bisa dipindah keluar transaksi (butuh data terkini), jadi yang
  // harus dijamin adalah query cek-collision-nya jalan di koneksi `tx` yang SAMA, bukan bikin
  // checkout koneksi kedua dari pool selagi row-lock Entitlement masih dipegang.
  it("oper `tx` ke generateUniqueShortCode (jangan checkout koneksi kedua saat pegang row-lock)", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);

    await createDevice("u1", { label: "Printer A", printerType: "bambu" });

    expect(generateUniqueShortCode).toHaveBeenCalledWith(tx);
  });

  it("simpan model kalau diisi (trim dulu)", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu", model: "  P1S  " });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567", model: "P1S" },
    });
  });

  it("model kosong/whitespace -> disimpan sebagai null", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu", model: "   " });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567", model: null },
    });
  });

  it("model tak diisi sama sekali (undefined) -> tak masuk ke data create sebagai key eksplisit", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    const tx = mockTx(0, 2);
    await createDevice("u1", { label: "Printer A", printerType: "bambu" });
    expect(tx.device.create).toHaveBeenCalledWith({
      data: { userId: "u1", label: "Printer A", printerType: "bambu", shortCode: "abc1234567" },
    });
  });

  it("model >11 byte -> InvalidDeviceModel, tolak SEBELUM buka transaksi", async () => {
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "ABCDEFGHIJKL" })).rejects.toThrow(InvalidDeviceModel);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("model persis 11 byte ASCII lolos, 12 byte ditolak (batas firmware char type[12])", async () => {
    (generateUniqueShortCode as any).mockResolvedValue("abc1234567");
    mockTx(0, 2);
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "12345678901" })).resolves.toBeTruthy();
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "123456789012" })).rejects.toThrow(InvalidDeviceModel);
  });

  it("validasi model pakai byte length, bukan .length -- string multibyte pendek tapi berat byte harus ditolak", async () => {
    // "文" (U+6587) = 3 byte UTF-8. 4 karakter = 12 byte > batas 11, walau .length cuma 4.
    await expect(createDevice("u1", { label: "X", printerType: "bambu", model: "文文文文" })).rejects.toThrow(InvalidDeviceModel);
  });
});

describe("getDeviceLimit", () => {
  it("pakai Entitlement.printerSlots kalau ada (tanpa nanya Config)", async () => {
    (prisma.entitlement.findUnique as any).mockResolvedValue({ printerSlots: 5 });
    expect(await getDeviceLimit("u1")).toBe(5);
    expect(getConfigInt).not.toHaveBeenCalled();
  });

  it("fallback ke Config printer.defaultSlots kalau printerSlots null / user belum punya baris", async () => {
    (prisma.entitlement.findUnique as any).mockResolvedValue(null);
    (getConfigInt as any).mockResolvedValue(1);
    expect(await getDeviceLimit("u1")).toBe(1);
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

  it("update model (trim, kosong -> null)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1", model: "P1S" });
    await updateDevice("u1", "d1", { model: "  P1S  " });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { model: "P1S" } });
  });

  it("model tak dioper (undefined) -> tak ikut di data update sama sekali", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1" });
    await updateDevice("u1", "d1", { label: "Baru" });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { label: "Baru" } });
  });

  it("model >11 byte saat update -> InvalidDeviceModel", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1" });
    await expect(updateDevice("u1", "d1", { model: "ABCDEFGHIJKL" })).rejects.toThrow(InvalidDeviceModel);
    expect(prisma.device.update).not.toHaveBeenCalled();
  });
});

describe("updateDeviceModelByShortCode", () => {
  it("update model by shortCode kalau device milik user", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" });
    (prisma.device.update as any).mockResolvedValue({ id: "d1", model: "P1S" });
    await updateDeviceModelByShortCode("u1", "abc1234567", "P1S");
    expect(prisma.device.findUnique).toHaveBeenCalledWith({ where: { shortCode: "abc1234567" } });
    expect(prisma.device.update).toHaveBeenCalledWith({ where: { shortCode: "abc1234567" }, data: { model: "P1S" } });
  });

  it("throw DeviceNotFound kalau shortCode tak ada", async () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    await expect(updateDeviceModelByShortCode("u1", "tidak-ada", "P1S")).rejects.toThrow(DeviceNotFound);
  });

  it("throw DeviceNotFound kalau shortCode milik user LAIN (jangan bocorkan keberadaannya)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u2", shortCode: "abc1234567" });
    await expect(updateDeviceModelByShortCode("u1", "abc1234567", "P1S")).rejects.toThrow(DeviceNotFound);
    expect(prisma.device.update).not.toHaveBeenCalled();
  });

  it("model >11 byte -> InvalidDeviceModel", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" });
    await expect(updateDeviceModelByShortCode("u1", "abc1234567", "ABCDEFGHIJKL")).rejects.toThrow(InvalidDeviceModel);
  });
});

describe("deleteDevice", () => {
  it("hapus device + bersihkan cell layout yang mereferensikan shortCode-nya, dalam 1 transaksi", async () => {
    const tx = {
      device: {
        findUnique: vi.fn().mockResolvedValue({ id: "d1", userId: "u1", shortCode: "abc1234567" }),
        delete: vi.fn().mockResolvedValue({}),
      },
      cydLayout: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "u1",
          config: {
            schemaVersion: 1,
            pages: [
              {
                id: "p1",
                grid: { cols: 2, rows: 2 },
                fields: [],
                durationSec: 5,
                cells: [
                  { printer: "abc1234567", col: 0, row: 0 },
                  { printer: "other0000001", col: 1, row: 0 },
                ],
              },
            ],
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

    await deleteDevice("u1", "d1");

    // Finding B: mutation-testing membuktikan membalik predikat filter (!== -> ===, yang
    // SEHARUSNYA menghapus cell milik device yang dihapus, tapi malah cuma nyisain cell ITU dan
    // buang semua cell lain) tetap lolos test lama, karena test lama cuma cek $transaction
    // dipanggil — tak pernah cek payload update-nya. Assert di sini langsung ke isi `data`.
    expect(tx.cydLayout.update).toHaveBeenCalledTimes(1);
    const updateArgs = (tx.cydLayout.update as any).mock.calls[0][0];
    const cells = updateArgs.data.config.pages[0].cells;
    expect(cells).toHaveLength(1);
    expect(cells[0].printer).toBe("other0000001");
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
