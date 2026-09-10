import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { FileAesCredentialStore } from "./credential-store-file-aes";

describe("FileAesCredentialStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-core-file-aes-"));
  });

  it("belum ada file key/data -> status empty", async () => {
    const store = new FileAesCredentialStore(dir);
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("save lalu load -> roundtrip status ok dengan blob yang sama", async () => {
    const store = new FileAesCredentialStore(dir);
    await store.save({ agentToken: "t", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "t", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } } });
  });

  it("data file ada tapi key file hilang -> status degraded (BUKAN empty -- data-loss risk kalau salah petakan)", async () => {
    const store = new FileAesCredentialStore(dir);
    await store.save({ agentToken: "t", devices: {} });
    rmSync(join(dir, "credentials.key"));
    const store2 = new FileAesCredentialStore(dir);
    expect(await store2.load()).toEqual({ status: "degraded", reason: "key_missing" });
  });

  it("isEncryptionAvailable selalu true (file-AES tak bergantung service eksternal)", () => {
    const store = new FileAesCredentialStore(dir);
    expect(store.isEncryptionAvailable()).toBe(true);
  });

  it("save() menulis lewat temp file lalu rename (bukan langsung ke file final)", async () => {
    const store = new FileAesCredentialStore(dir);
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    const renameSpy = vi.spyOn(fs, "renameSync");

    await store.save({ agentToken: "tok", devices: {} });

    // writeFileSync harus dipanggil ke path yang BUKAN credentials.enc final (temp file dulu)
    const dataFileWrites = writeSpy.mock.calls.filter((call) => String(call[0]).includes("credentials.enc") && !String(call[0]).includes(".tmp"));
    expect(dataFileWrites).toHaveLength(0);
    expect(renameSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it("save() tetap benar-benar bisa dibaca balik setelah rename (round-trip tak berubah)", async () => {
    const store = new FileAesCredentialStore(dir);
    await store.save({ agentToken: "tok", devices: { ABC: { ip: "1.2.3.4", serial: "s", accessCode: "c" } } });
    const result = await store.load();
    expect(result).toEqual({ status: "ok", blob: { agentToken: "tok", devices: { ABC: { ip: "1.2.3.4", serial: "s", accessCode: "c" } } } });
  });
});
