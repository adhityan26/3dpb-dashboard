import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/fake/userdata") } }));
vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { loadDeviceCache, saveDeviceCache } from "./device-cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadDeviceCache", () => {
  it("balikin [] kalau file belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    expect(await loadDeviceCache()).toEqual([]);
  });

  it("balikin [] (bukan throw) kalau file isinya JSON rusak", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue("bukan json valid{{{");
    expect(await loadDeviceCache()).toEqual([]);
  });

  it("parse isi file dengan benar", async () => {
    const cached = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu" }];
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(cached));
    expect(await loadDeviceCache()).toEqual(cached);
  });
});

describe("saveDeviceCache", () => {
  it("tulis JSON plain (tak terenkripsi) ke file", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    const devices = [{ shortCode: "x", label: "L", printerType: "moonraker" }];
    await saveDeviceCache(devices);
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining("device-cache.json"), JSON.stringify(devices));
  });
});
