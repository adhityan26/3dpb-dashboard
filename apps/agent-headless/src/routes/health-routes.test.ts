import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { AgentRuntime, InMemoryCredentialStore } from "@3pb/agent-core";
import { registerHealthRoutes } from "./health-routes";

function makeRuntime() {
  const store = new InMemoryCredentialStore();
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

describe("GET /healthz", () => {
  it("balikin status runtime saat ini, TANPA butuh auth header", async () => {
    const runtime = makeRuntime();
    const app = Fastify();
    registerHealthRoutes(app, runtime);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      httpOk: true,
      brokerPort: null,
      engineRunning: false,
      credentialStoreDegraded: false,
    });
  });

  it("mencerminkan state runtime setelah broker/engine berubah", async () => {
    const runtime = makeRuntime();
    runtime.setBrokerPort(1883);
    runtime.setCredentialStoreDegraded(true);
    const app = Fastify();
    registerHealthRoutes(app, runtime);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.json()).toEqual({
      httpOk: true,
      brokerPort: 1883,
      engineRunning: false,
      credentialStoreDegraded: true,
    });
  });
});
