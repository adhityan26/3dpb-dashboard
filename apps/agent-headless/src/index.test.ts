import { describe, it, expect, vi } from "vitest";
import { bootstrap, printToken } from "./index";
import { InMemoryCredentialStore } from "@3pb/agent-core";

vi.mock("@3pb/agent-core", async () => {
  const actual = await vi.importActual<typeof import("@3pb/agent-core")>("@3pb/agent-core");
  return { ...actual, loadOrCreateConfig: vi.fn().mockResolvedValue({ saasBaseUrl: "http://test.example.com" }) };
});

describe("bootstrap", () => {
  it("HTTP server bisa di-inject SEBELUM runtime.start() dipanggil (urutan HTTP-dulu)", async () => {
    const { app } = await bootstrap({ skipRuntimeStart: true });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("/healthz reachable bahkan kalau runtime.start() belum selesai (dipanggil tapi tidak di-await sebelum server siap)", async () => {
    const { app, runtime } = await bootstrap({});
    expect(runtime).toBeDefined();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    await app.close();
    await runtime.stop();
  });
});

describe("printToken", () => {
  it("generate token baru kalau belum ada, balikin string 64 hex char", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await printToken(store, logger);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("idempoten -- panggilan kedua balikin token yang sama", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const first = await printToken(store, logger);
    const second = await printToken(store, logger);
    expect(first).toBe(second);
  });
});
