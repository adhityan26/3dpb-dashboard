import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { loadDeviceCache, saveDeviceCache } from "./device-cache";
import fs from "node:fs";
import type { PathProvider } from "./interfaces";

const pathProvider: PathProvider = { userDataDir: () => "/fake/userdata" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadDeviceCache", () => {
  it("file belum ada -> balikin array kosong", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await loadDeviceCache(pathProvider)).toEqual([]);
  });

  it("file ada -> parse JSON-nya", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]));
    expect(await loadDeviceCache(pathProvider)).toEqual([{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]);
  });

  it("file corrupt (JSON invalid) -> balikin array kosong, bukan throw", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not json");
    expect(await loadDeviceCache(pathProvider)).toEqual([]);
  });
});

describe("saveDeviceCache", () => {
  it("bikin folder kalau belum ada, tulis JSON", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await saveDeviceCache(pathProvider, [{ shortCode: "ABC", label: "Printer A", printerType: "bambu" }]);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
