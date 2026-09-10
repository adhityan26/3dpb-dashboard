import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { AgentRuntime, AgentService, InMemoryCredentialStore } from "@3pb/agent-core";
import { registerAgentRoutes } from "./agent-routes";

// scanLan() memanggil scanBambu/scanMoonraker sungguhan (buka socket UDP, blocking ~5-20 detik).
// Mock di level module ini (path relatif ke source package-nya, sama seperti pola
// packages/agent-core/src/agent-service.test.ts) supaya test route ini cepat & deterministik.
vi.mock("../../../../packages/agent-core/src/discovery/bambu-ssdp", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/discovery/bambu-ssdp")>(
    "../../../../packages/agent-core/src/discovery/bambu-ssdp",
  );
  return { ...actual, scanBambu: vi.fn() };
});
vi.mock("../../../../packages/agent-core/src/discovery/moonraker-mdns", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/discovery/moonraker-mdns")>(
    "../../../../packages/agent-core/src/discovery/moonraker-mdns",
  );
  return { ...actual, scanMoonraker: vi.fn() };
});

import * as discovery1 from "../../../../packages/agent-core/src/discovery/bambu-ssdp";
import * as discovery2 from "../../../../packages/agent-core/src/discovery/moonraker-mdns";

function makeFixture(seed: ConstructorParameters<typeof InMemoryCredentialStore>[0] = null) {
  const store = new InMemoryCredentialStore(seed);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.1", commitHash: "abc" },
    saasBaseUrl: "http://test.example.com",
    updatePlatform: "linux",
  });
  const service = new AgentService(runtime);
  const app = Fastify();
  app.register(multipart);
  registerAgentRoutes(app, service);
  // Meniru setErrorHandler produksi di http-server.ts (route file-operation THROW pada error) --
  // biar test di sini bisa cek pemetaan status HTTP tanpa harus lewat createHttpServer penuh.
  app.setErrorHandler((error, _req, reply) => {
    if (error.message === "device_not_found") {
      reply.code(404).send({ error: "device_not_found" });
      return;
    }
    logger.error("[agent-headless] unhandled route error", error);
    reply.code(502).send({ error: "upstream_error" });
  });
  return { app, runtime, store, logger };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).fetch = fetchMock;
});

describe("POST /api/activate", () => {
  it("token valid -> 200, body = FetchResult sukses", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => [] });
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/activate", payload: { token: "tok123" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: [] });
  });
});

describe("GET /api/snapshot", () => {
  it("tanpa engine -> 200 {payload:[]}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/snapshot" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ payload: [] });
  });
});

describe("GET /api/broker-info", () => {
  it("baca state runtime saat ini", async () => {
    const { app, runtime } = makeFixture();
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const res = await app.inject({ method: "GET", url: "/api/broker-info" });
    expect(res.json()).toMatchObject({ port: 1883, pin: "1234" });
  });
});

describe("POST /api/devices/:shortCode/pair", () => {
  it("body valid -> 204, credential tersimpan", async () => {
    const { app, store } = makeFixture();
    const secret = { ip: "1.2.3.4", serial: "s", accessCode: "c" };
    const res = await app.inject({ method: "POST", url: "/api/devices/ABC/pair", payload: secret });
    expect(res.statusCode).toBe(204);
    expect(await store.load()).toMatchObject({ status: "ok", blob: { devices: { ABC: secret } } });
  });
});

describe("DELETE /api/devices/:shortCode", () => {
  it("forgetDevice -> 204", async () => {
    const { app } = makeFixture({ agentToken: null, devices: { ABC: { ip: "x", serial: "s", accessCode: "c" } } });
    const res = await app.inject({ method: "DELETE", url: "/api/devices/ABC" });
    expect(res.statusCode).toBe(204);
  });
});

describe("PATCH /api/devices/:shortCode/model", () => {
  it("tanpa agentToken -> 200 {ok:false}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "PATCH", url: "/api/devices/ABC/model", payload: { model: "x" } });
    expect(res.json()).toEqual({ ok: false });
  });
});

describe("POST /api/sync", () => {
  it("tanpa agentToken -> 200 {ok:false, kind:invalid_token}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/sync" });
    expect(res.json()).toEqual({ ok: false, kind: "invalid_token" });
  });
});

describe("GET /api/activation-state", () => {
  it("tanpa agentToken -> hasToken:false", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/activation-state" });
    expect(res.json()).toEqual({ hasToken: false, devices: [], pairedShortCodes: [] });
  });
});

describe("POST /api/printers/:deviceId/command", () => {
  it("tanpa engine -> engine_not_running", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/printers/dev1/command", payload: { type: "pause" } });
    expect(res.json()).toEqual({ ok: false, message: "engine_not_running" });
  });
});

describe("GET /api/credential-store-status, GET /api/update-status", () => {
  it("baca state runtime saat ini", async () => {
    const { app, runtime } = makeFixture();
    runtime.setCredentialStoreDegraded(true);
    runtime.setUpdateAvailable(true);
    const res1 = await app.inject({ method: "GET", url: "/api/credential-store-status" });
    expect(res1.json()).toEqual({ degraded: true });
    const res2 = await app.inject({ method: "GET", url: "/api/update-status" });
    expect(res2.json()).toEqual({ updateAvailable: true });
  });
});

describe("POST /api/scan-lan", () => {
  it("balikin gabungan hasil scanBambu+scanMoonraker (mock jaringan sungguhan, bukan mock AgentService)", async () => {
    vi.mocked(discovery1.scanBambu).mockResolvedValue({ ok: true, printers: [] });
    vi.mocked(discovery2.scanMoonraker).mockResolvedValue([]);
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/scan-lan" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ bambu: { ok: true, printers: [] }, moonraker: [] });
  });
});

describe("POST /api/send-logs", () => {
  it("tanpa agentToken -> {ok:false, reason:no_token}", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "POST", url: "/api/send-logs" });
    expect(res.json()).toEqual({ ok: false, reason: "no_token" });
  });
});

describe("GET /api/devices/:shortCode/files", () => {
  it("device tak dipasang -> 404 device_not_found", async () => {
    const { app } = makeFixture();
    const res = await app.inject({ method: "GET", url: "/api/devices/UNKNOWN/files?path=/" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/devices/:shortCode/files/thumbnail", () => {
  it("extension bukan .gcode/.gcode.3mf -> 404", async () => {
    const { app } = makeFixture({ agentToken: null, devices: { ABC: { ip: "x", serial: "s", accessCode: "c" } } });
    const res = await app.inject({ method: "GET", url: "/api/devices/ABC/files/thumbnail?remotePath=/file.txt" });
    expect(res.statusCode).toBe(404);
  });
});
