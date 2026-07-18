import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    config: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getConfig, getAllConfig, setConfig, parsePrice, DEFAULT_CONFIG } from "@/lib/config";

describe("parsePrice", () => {
  it("angka valid", () => { expect(parsePrice("150000")).toBe(150000); });
  it("dengan spasi", () => { expect(parsePrice(" 150000 ")).toBe(150000); });
  it("non-numerik → null", () => { expect(parsePrice("gratis")).toBeNull(); });
  it("kosong → null", () => { expect(parsePrice("")).toBeNull(); });
});

describe("getConfig", () => {
  beforeEach(() => { vi.clearAllMocks() });
  it("pakai nilai DB bila ada", async () => {
    (prisma.config.findUnique as any).mockResolvedValue({ key: "price.beli", value: "199000" });
    expect(await getConfig("price.beli")).toBe("199000");
  });
  it("fallback ke DEFAULT_CONFIG bila absen", async () => {
    (prisma.config.findUnique as any).mockResolvedValue(null);
    expect(await getConfig("copy.hero.headline")).toBe(DEFAULT_CONFIG["copy.hero.headline"]);
  });
  it("key tak dikenal & absen → string kosong", async () => {
    (prisma.config.findUnique as any).mockResolvedValue(null);
    expect(await getConfig("tak.ada")).toBe("");
  });
});

describe("getAllConfig", () => {
  beforeEach(() => { vi.clearAllMocks() });
  it("merge default ⊕ DB (DB menang)", async () => {
    (prisma.config.findMany as any).mockResolvedValue([{ key: "price.beli", value: "199000" }]);
    const all = await getAllConfig();
    expect(all["price.beli"]).toBe("199000");
    expect(all["copy.hero.headline"]).toBe(DEFAULT_CONFIG["copy.hero.headline"]);
  });
});

describe("setConfig", () => {
  beforeEach(() => { vi.clearAllMocks() });
  it("upsert key/value", async () => {
    await setConfig("price.beli", "250000");
    expect(prisma.config.upsert).toHaveBeenCalledWith({
      where: { key: "price.beli" },
      create: { key: "price.beli", value: "250000" },
      update: { value: "250000" },
    });
  });
});
