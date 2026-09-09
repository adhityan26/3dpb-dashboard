import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { SafeStorageCredentialStore } from "./platform-electron";
import { safeStorage } from "electron";
import fs from "node:fs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SafeStorageCredentialStore.load", () => {
  it("enkripsi tak tersedia -> status degraded", async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "degraded", reason: "encryption_unavailable" });
  });

  it("file belum ada -> status empty", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("file ada, decrypt sukses -> status ok + blob", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("ENC({\"agentToken\":\"t\",\"devices\":{}})"));
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "t", devices: {} } });
  });

  it("file ada tapi decrypt gagal (corrupt/key beda) -> status degraded, BUKAN empty", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("garbage"));
    vi.mocked(safeStorage.decryptString).mockImplementation(() => { throw new Error("bad key"); });
    const store = new SafeStorageCredentialStore();
    expect(await store.load()).toEqual({ status: "degraded", reason: "decrypt_failed" });
  });
});

describe("SafeStorageCredentialStore.save", () => {
  it("bikin folder kalau belum ada, tulis file terenkripsi", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const store = new SafeStorageCredentialStore();
    await store.save({ agentToken: "t", devices: {} });
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/userdata", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

vi.mock("electron-log/main", () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    transports: { file: { getFile: () => ({ path: "/fake/logs/agent.log" }) } },
  },
}));

import { ElectronPathProvider, ElectronLogAdapter, ElectronLogFileProvider, getElectronBuildInfo } from "./platform-electron";
import log from "electron-log/main";

describe("ElectronPathProvider", () => {
  it("userDataDir() delegasi ke app.getPath('userData')", () => {
    expect(new ElectronPathProvider().userDataDir()).toBe("/fake/userdata");
  });
});

describe("ElectronLogAdapter", () => {
  it("info/warn/error delegasi ke electron-log", () => {
    const adapter = new ElectronLogAdapter();
    adapter.error("test", { detail: 1 });
    expect(log.error).toHaveBeenCalledWith("test", { detail: 1 });
  });
});

describe("ElectronLogFileProvider", () => {
  it("getLogFilePath() delegasi ke electron-log transport", () => {
    expect(new ElectronLogFileProvider().getLogFilePath()).toBe("/fake/logs/agent.log");
  });
});

describe("getElectronBuildInfo", () => {
  it("fallback ke 0.0.0/nogit di luar build sungguhan (define tak ada)", () => {
    expect(getElectronBuildInfo()).toEqual({ version: "0.0.0", commitHash: "nogit" });
  });
});
