import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { AgentRuntime, AgentService, InMemoryCredentialStore, ensureApiToken } from "@3pb/agent-core";
import { createHttpServer, MAX_UPLOAD_BYTES } from "./http-server";

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

  it("/healthz?probe=1 (query string) tetap dianggap /healthz -- bisa diakses TANPA token", async () => {
    const app = createHttpServer(makeRuntime(), new AgentService(makeRuntime()));
    const res = await app.inject({ method: "GET", url: "/healthz?probe=1" });
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

describe("setErrorHandler -- pemetaan status HTTP", () => {
  async function authedApp() {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider: { userDataDir: () => "/fake" },
      logger,
      logFileProvider: { getLogFilePath: () => null },
      buildInfo: { version: "0.0.1", commitHash: "abc" },
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "linux",
    });
    const app = createHttpServer(runtime, new AgentService(runtime));
    return { app, token, logger };
  }

  it("error dengan statusCode dari Fastify (mis. body JSON malformed) diteruskan apa adanya, bukan 502/500", async () => {
    const { app, token } = await authedApp();
    app.post("/test-fastify-status", async () => ({ ok: true }));
    const res = await app.inject({
      method: "POST",
      url: "/test-fastify-status",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: "{not valid json",
    });
    expect(res.statusCode).toBe(400);
  });

  it("error message device_not_found -> 404", async () => {
    const { app, token } = await authedApp();
    app.get("/test-404", async () => {
      throw new Error("device_not_found");
    });
    const res = await app.inject({ method: "GET", url: "/test-404", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "device_not_found" });
  });

  it("error dengan kode koneksi upstream (mis. ECONNREFUSED dari FTPS/printer) -> 502, pesan mentah tidak bocor", async () => {
    const { app, token } = await authedApp();
    app.get("/test-upstream", async () => {
      const err = new Error("connect ECONNREFUSED 10.0.0.5:990 -- rahasia internal jangan bocor");
      (err as NodeJS.ErrnoException).code = "ECONNREFUSED";
      throw err;
    });
    const res = await app.inject({ method: "GET", url: "/test-upstream", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "upstream_error" });
  });

  it("error tak terklasifikasi (bukan device_not_found, bukan pola koneksi upstream, tanpa statusCode) -> 500 generik, pesan mentah tidak bocor", async () => {
    const { app, token, logger } = await authedApp();
    app.get("/test-bug", async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'foo') -- detail internal jangan bocor");
    });
    const res = await app.inject({ method: "GET", url: "/test-bug", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("crash-guard: POST /api/activate dengan body malformed", () => {
  it("body kosong -> 400 (bukan TypeError tak tertangani / 500)", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider: { userDataDir: () => "/fake" },
      logger,
      logFileProvider: { getLogFilePath: () => null },
      buildInfo: { version: "0.0.1", commitHash: "abc" },
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "linux",
    });
    const app = createHttpServer(runtime, new AgentService(runtime));
    const res = await app.inject({
      method: "POST",
      url: "/api/activate",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("token bukan string -> 400", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider: { userDataDir: () => "/fake" },
      logger,
      logFileProvider: { getLogFilePath: () => null },
      buildInfo: { version: "0.0.1", commitHash: "abc" },
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "linux",
    });
    const app = createHttpServer(runtime, new AgentService(runtime));
    const res = await app.inject({
      method: "POST",
      url: "/api/activate",
      headers: { authorization: `Bearer ${token}` },
      payload: { token: 12345 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("crash-guard: POST /api/devices/:shortCode/files/rename dengan body malformed", () => {
  it("oldPath/newPath hilang -> 400 (bukan diteruskan undefined ke FTPS client)", async () => {
    const store = new InMemoryCredentialStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const token = await ensureApiToken(store, logger);
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider: { userDataDir: () => "/fake" },
      logger,
      logFileProvider: { getLogFilePath: () => null },
      buildInfo: { version: "0.0.1", commitHash: "abc" },
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "linux",
    });
    const app = createHttpServer(runtime, new AgentService(runtime));
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/ABC/files/rename",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("upload size limit (@fastify/multipart limits.fileSize)", () => {
  it("MAX_UPLOAD_BYTES terpasang sebagai limit -- masuk akal untuk file G-code/3MF (ratusan MB)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
  });

  it("upload melebihi limit (uji dengan limit kecil supaya cepat) -> file.file emit 'limit', bukan diterima diam-diam", async () => {
    // createHttpServer() hardcode limit 200MB (realistis untuk produksi, tapi terlalu besar untuk
    // ditembak langsung di test). Di sini kita registrasikan @fastify/multipart dengan opsi yang
    // SAMA PERSIS seperti createHttpServer (limits: { fileSize: N }), hanya N-nya dikecilkan,
    // untuk membuktikan bahwa `limits.fileSize` -- fitur yang sama yang dipasang di produksi --
    // benar-benar menolak file yang melebihi batas.
    const testApp = Fastify({ logger: false });
    await testApp.register(multipart, { limits: { fileSize: 10 } });
    testApp.post("/upload", async (req) => {
      const data = await req.file();
      if (!data) return { received: false };
      // resume() + race 'limit'/'end' (bukan for-await manual) -- menghindari backpressure yang
      // bisa menggantung kalau stream tidak pernah 'end' sendiri setelah truncated.
      const truncated = await new Promise<boolean>((resolve) => {
        data.file.on("limit", () => resolve(true));
        data.file.on("end", () => resolve(data.file.truncated));
        data.file.resume();
      });
      return { received: true, truncated };
    });

    const form = new FormData();
    form.append("file", new Blob([Buffer.alloc(1000, "a")]), "big.gcode");
    const res = await testApp.inject({ method: "POST", url: "/upload", payload: form as unknown as Record<string, unknown> });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true, truncated: true });
  }, 15000);
});
