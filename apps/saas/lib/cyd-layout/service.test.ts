import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    cydLayout: { findUnique: vi.fn(), upsert: vi.fn() },
    device: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { getLayout, saveLayout, saveLayoutForUser, defaultSaasLayout, InvalidLayoutConfig } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("defaultSaasLayout", () => {
  it("grid kecil (bukan copy 10x8 punya rak internal)", () => {
    const d = defaultSaasLayout();
    expect(d.pages).toHaveLength(1);
    expect(d.pages[0].grid.cols).toBeLessThanOrEqual(3);
    expect(d.pages[0].grid.rows).toBeLessThanOrEqual(3);
    expect(d.pages[0].cells).toHaveLength(0);
  });
});

describe("getLayout", () => {
  it("balikin default eksplisit kalau belum pernah disimpan", async () => {
    (prisma.cydLayout.findUnique as any).mockResolvedValue(null);
    const layout = await getLayout("u1");
    expect(layout.pages).toHaveLength(1);
  });

  it("balikin config tersimpan kalau ada", async () => {
    const saved = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] };
    (prisma.cydLayout.findUnique as any).mockResolvedValue({ userId: "u1", config: saved });
    const layout = await getLayout("u1");
    expect(layout).toEqual(saved);
  });
});

describe("saveLayout", () => {
  it("tolak config yang gagal validateLayoutConfig", async () => {
    await expect(saveLayout("u1", { bukan: "config valid" }, [])).rejects.toThrow(InvalidLayoutConfig);
  });

  it("tolak referensi shortCode yang bukan milik user", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "bukan-punya-user", col: 0, row: 0 }] }] };
    await expect(saveLayout("u1", config, ["punya-user-1"])).rejects.toThrow(InvalidLayoutConfig);
  });

  it("simpan kalau valid & semua shortCode dikenal", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "punya-user-1", col: 0, row: 0 }] }] };
    (prisma.cydLayout.upsert as any).mockResolvedValue({ userId: "u1", config });
    const result = await saveLayout("u1", config, ["punya-user-1"]);
    expect(result).toEqual(config);
    expect(prisma.cydLayout.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", config },
      update: { config },
    });
  });

  // Regresi: validateLayoutConfig() saat ini balikin input apa adanya (tak rekonstruksi object),
  // jadi headerText ikut lolos ke Prisma tanpa whitelist eksplisit. Kalau nanti fungsi itu
  // "dikeraskan" jadi membangun ulang output & lupa copy headerText, test ini yang menangkapnya.
  it("headerText ikut tersimpan ke config yang di-upsert ke Prisma", async () => {
    const config = {
      schemaVersion: 1,
      headerText: "Semangat pagi!",
      pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "punya-user-1", col: 0, row: 0 }] }],
    };
    (prisma.cydLayout.upsert as any).mockResolvedValue({ userId: "u1", config });
    const result = await saveLayout("u1", config, ["punya-user-1"]);
    expect(result).toEqual(config);
    expect(prisma.cydLayout.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", config: expect.objectContaining({ headerText: "Semangat pagi!" }) },
      update: { config: expect.objectContaining({ headerText: "Semangat pagi!" }) },
    });
  });

  it("pakai client yang dioper (tx) buat upsert kalau ada", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] };
    const tx = { cydLayout: { upsert: vi.fn().mockResolvedValue({}) }, device: { findMany: vi.fn() } };
    await saveLayout("u1", config, [], tx as any);
    expect(tx.cydLayout.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.cydLayout.upsert).not.toHaveBeenCalled();
  });
});

// Final review Finding 6: dulu route memanggil listDevices() lalu saveLayout() terpisah — di sela
// keduanya, deleteDevice paralel bisa menghapus device yang shortCode-nya masih dipakai layout
// yang sedang disimpan. Yang diverifikasi di sini: baca daftar device DAN upsert layout
// dua-duanya terjadi lewat `tx` yang sama di dalam SATU prisma.$transaction.
describe("saveLayoutForUser", () => {
  function mockTx(shortCodes: string[]) {
    const tx = {
      device: { findMany: vi.fn().mockResolvedValue(shortCodes.map((shortCode) => ({ shortCode }))) },
      cydLayout: { upsert: vi.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    return tx;
  }

  it("baca daftar device & upsert layout di dalam satu $transaction (pakai tx yang sama)", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "punya-user-1", col: 0, row: 0 }] }] };
    const tx = mockTx(["punya-user-1"]);

    const result = await saveLayoutForUser("u1", config);

    expect(result).toEqual(config);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.device.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, select: { shortCode: true } });
    expect(tx.cydLayout.upsert).toHaveBeenCalledTimes(1);
    // Baca device HARUS mendahului upsert (validasi kepemilikan sebelum simpan), dan dua-duanya
    // lewat tx — bukan prisma global (yang berarti keluar dari snapshot transaksi).
    expect((tx.device.findMany as any).mock.invocationCallOrder[0]).toBeLessThan((tx.cydLayout.upsert as any).mock.invocationCallOrder[0]);
    expect(prisma.device.findMany).not.toHaveBeenCalled();
    expect(prisma.cydLayout.upsert).not.toHaveBeenCalled();
  });

  it("tolak (dan tak upsert apa pun) kalau layout mereferensikan device yang tak ada di snapshot transaksi", async () => {
    const config = { schemaVersion: 1, pages: [{ id: "p1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ printer: "sudah-dihapus", col: 0, row: 0 }] }] };
    const tx = mockTx(["punya-user-1"]);

    await expect(saveLayoutForUser("u1", config)).rejects.toThrow(InvalidLayoutConfig);
    expect(tx.cydLayout.upsert).not.toHaveBeenCalled();
  });
});
