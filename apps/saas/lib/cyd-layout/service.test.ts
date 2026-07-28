import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    cydLayout: { findUnique: vi.fn(), upsert: vi.fn() },
    device: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getLayout, saveLayout, defaultSaasLayout, InvalidLayoutConfig } from "./service";

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
});
