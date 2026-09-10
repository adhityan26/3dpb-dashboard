import { describe, it, expect, vi } from "vitest";
import { AgentRuntime, AgentService, InMemoryCredentialStore, ensureApiToken } from "@3pb/agent-core";
import { createHttpServer } from "./http-server";

function makeRuntime(store = new InMemoryCredentialStore()) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "linux",
  });
}

describe("createHttpServer", () => {
  it("/healthz bisa diakses TANPA token", async () => {
    const app = createHttpServer(makeRuntime(), new AgentService(makeRuntime()));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("route lain (belum ada di task ini, tapi auth hook harus terpasang global) -- request tanpa auth ke path acak balikin 404, bukan 401 (Fastify default not-found), TAPI auth hook harus tetap dipanggil sebelum routing kalau path terdaftar", async () => {
    // Test minimal untuk task ini: pastikan hook auth benar-benar TERPASANG, dicek lewat route dummy.
    const runtime = makeRuntime();
    const app = createHttpServer(runtime, new AgentService(runtime));
    app.get("/test-protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/test-protected" });
    expect(res.statusCode).toBe(401);
  });

  it("route selain /healthz dengan token benar -> lolos auth", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = makeRuntime(store);
    const app = createHttpServer(runtime, new AgentService(runtime));
    app.get("/test-protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/test-protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });
});
