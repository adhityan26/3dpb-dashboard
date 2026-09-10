import { describe, it, expect, vi } from "vitest";
import { loadCredentials, saveCredentials, ensureBrokerPin, clearBrokerPin, ensureApiToken, clearApiToken, type CredentialBlob } from "./credential-store";
import type { CredentialStore, CredentialLoadResult, Logger } from "./interfaces";
import { InMemoryCredentialStore } from "./in-memory-credential-store";

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeStore(initial: CredentialLoadResult<CredentialBlob>): CredentialStore<CredentialBlob> & { saved: CredentialBlob[] } {
  const saved: CredentialBlob[] = [];
  let current = initial;
  return {
    saved,
    async load() {
      return current;
    },
    async save(blob) {
      saved.push(blob);
      current = { status: "ok", blob };
    },
    isEncryptionAvailable() {
      return true;
    },
  };
}

describe("loadCredentials", () => {
  it("status ok -> balikin blob-nya", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "t", devices: {} } });
    expect(await loadCredentials(store)).toEqual({ agentToken: "t", devices: {} });
  });

  it("status empty -> balikin blob kosong", async () => {
    const store = makeStore({ status: "empty" });
    expect(await loadCredentials(store)).toEqual({ agentToken: null, devices: {} });
  });

  it("status degraded -> balikin blob kosong (BUKAN throw)", async () => {
    const store = makeStore({ status: "degraded", reason: "decrypt_failed" });
    expect(await loadCredentials(store)).toEqual({ agentToken: null, devices: {} });
  });
});

describe("ensureBrokerPin", () => {
  it("status ok dengan brokerPin sudah ada -> balikin PIN yang sama, tidak save ulang", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "t", devices: {}, brokerPin: "1234" } });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toBe("1234");
    expect(store.saved).toHaveLength(0);
  });

  it("status ok TANPA brokerPin -> generate PIN baru, save dengan blob asli dipertahankan (augment, bukan timpa)", async () => {
    const store = makeStore({ status: "ok", blob: { agentToken: "existing-token", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } } } });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toEqual([{ agentToken: "existing-token", devices: { ABC: { ip: "1.1.1.1", serial: "S", accessCode: "999" } }, brokerPin: pin }]);
  });

  it("status EMPTY (genuinely first-run) -> DIPERLAKUKAN SAMA AMANNYA seperti ok: generate PIN, save blob kosong+PIN", async () => {
    const store = makeStore({ status: "empty" });
    const pin = await ensureBrokerPin(store, makeLogger());
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toEqual([{ agentToken: null, devices: {}, brokerPin: pin }]);
  });

  it("status DEGRADED -> PIN session-only, TIDAK PERNAH memanggil save (data-loss risk)", async () => {
    const store = makeStore({ status: "degraded", reason: "decrypt_failed" });
    const logger = makeLogger();
    const pin = await ensureBrokerPin(store, logger);
    expect(pin).toMatch(/^\d{4}$/);
    expect(store.saved).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("clearBrokerPin", () => {
  it("hapus field brokerPin dari blob, pure function tanpa I/O", () => {
    const blob: CredentialBlob = { agentToken: "t", devices: {}, brokerPin: "1234" };
    expect(clearBrokerPin(blob)).toEqual({ agentToken: "t", devices: {}, brokerPin: undefined });
  });
});

describe("ensureApiToken", () => {
  it("belum ada token -> generate token baru 64 hex char (32 byte), simpan ke blob", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: null, devices: {}, apiToken: token } });
  });

  it("sudah ada token -> balikin yang sama, tidak generate ulang", async () => {
    const store = new InMemoryCredentialStore({ agentToken: null, devices: {}, apiToken: "existing-token-value" });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toBe("existing-token-value");
  });

  it("blob sudah ada (augment, bukan timpa) -- agentToken/devices lama tetap utuh", async () => {
    const store = new InMemoryCredentialStore({ agentToken: "tok", devices: { ABC: { ip: "1.1.1.1", serial: "s", accessCode: "c" } } });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await ensureApiToken(store, logger);
    const result = await store.load();
    expect(result).toEqual({ status: "ok", blob: { agentToken: "tok", devices: { ABC: { ip: "1.1.1.1", serial: "s", accessCode: "c" } }, apiToken: expect.any(String) } });
  });

  it("status degraded -> token session-only, TIDAK disimpan, logger.error dipanggil, PIN tidak pernah di-log", async () => {
    const store: CredentialStore<CredentialBlob> = {
      load: async () => ({ status: "degraded", reason: "decrypt_failed" }),
      save: vi.fn(),
      isEncryptionAvailable: () => true,
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(store.save).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    const loggedArgs = vi.mocked(logger.error).mock.calls[0];
    expect(loggedArgs.join(" ")).not.toContain(token);
  });
});

describe("clearApiToken", () => {
  it("pure function -- hapus apiToken dari blob, sisanya tak berubah", () => {
    const blob: CredentialBlob = { agentToken: "tok", devices: {}, apiToken: "abc" };
    expect(clearApiToken(blob)).toEqual({ agentToken: "tok", devices: {}, apiToken: undefined });
  });
});
