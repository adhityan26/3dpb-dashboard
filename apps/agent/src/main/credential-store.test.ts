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

import { loadCredentials, saveCredentials, ensureBrokerPin, clearBrokerPin } from "./credential-store";
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

describe("ensureBrokerPin", () => {
  it("genuinely first run (no file, encryption available) -> generate PIN 4-digit dan persist", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(
      (safeStorage.decryptString as any)((fs.writeFileSync as any).mock.calls[0][1])
    );
    expect(written.brokerPin).toBe(pin);
  });

  it("blob sudah punya brokerPin -> pakai yang tersimpan, TIDAK generate baru / TIDAK saveCredentials lagi", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      Buffer.from(`ENC(${JSON.stringify({ agentToken: null, devices: {}, brokerPin: "0042" })})`)
    );
    const pin = await ensureBrokerPin();
    expect(pin).toBe("0042");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("file ADA tapi decrypt gagal -> PIN in-memory-only, TIDAK PERNAH panggil saveCredentials (data-loss guard)", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("corrupt"));
    (safeStorage.decryptString as any).mockImplementationOnce(() => {
      throw new Error("DPAPI fail");
    });
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("genuinely first run TAPI safeStorage.isEncryptionAvailable() false -> PIN in-memory-only, TIDAK PERNAH panggil saveCredentials", async () => {
    (fs.existsSync as any).mockReturnValue(false);
    (safeStorage.isEncryptionAvailable as any).mockReturnValueOnce(false);
    const pin = await ensureBrokerPin();
    expect(pin).toMatch(/^\d{4}$/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe("clearBrokerPin", () => {
  it("hapus brokerPin dari blob, sisa field (agentToken/devices) tak tersentuh -- pure function, no I/O", () => {
    const blob = { agentToken: "slz_x", devices: { a: { ip: "1.1.1.1", serial: "S", accessCode: "1234" } }, brokerPin: "0042" };
    const result = clearBrokerPin(blob);
    expect(result).toEqual({ agentToken: "slz_x", devices: blob.devices, brokerPin: undefined });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
