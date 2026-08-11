import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/userdata") },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC(${s})`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace(/^ENC\(/, "").replace(/\)$/, "")),
  },
}));
vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() },
}));

import { loadCredentials, saveCredentials } from "./credential-store";
import { safeStorage } from "electron";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadCredentials", () => {
  it("balikin blob kosong kalau file belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("balikin blob kosong (bukan throw) kalau decrypt gagal", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("corrupt"));
    (safeStorage.decryptString as any).mockImplementationOnce(() => { throw new Error("DPAPI fail"); });
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("balikin blob kosong kalau safeStorage.isEncryptionAvailable() false", async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValueOnce(false);
    (fs.existsSync as any).mockReturnValue(true);
    const blob = await loadCredentials();
    expect(blob).toEqual({ agentToken: null, devices: {} });
  });

  it("decrypt+parse blob tersimpan dengan benar", async () => {
    const stored = { agentToken: "slz_abc", devices: { xyz1234567: { ip: "192.168.1.5", serial: "S1", accessCode: "1234" } } };
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from(`ENC(${JSON.stringify(stored)})`));
    const blob = await loadCredentials();
    expect(blob).toEqual(stored);
  });
});

describe("saveCredentials", () => {
  it("encrypt lalu tulis file, bikin folder kalau belum ada", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const blob = { agentToken: "slz_x", devices: {} };
    await saveCredentials(blob);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(blob));
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
