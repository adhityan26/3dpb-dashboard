import { describe, it, expect, vi } from "vitest";
import { AgentRuntime, AgentService, InMemoryCredentialStore } from "@3pb/agent-core";
import { createHttpServer } from "../http-server";

// Test regresi table-driven yang dibangun lewat createHttpServer() SUNGGUHAN (bukan Fastify app
// hand-rolled yang meng-implementasi-ulang error handler, seperti di agent-routes.test.ts) --
// itu pola yang secara struktural TIDAK BISA menangkap regresi di auth hook produksi (kalau
// authHook lupa dipasang di createHttpServer, test yang pakai app buatan sendiri tetap lolos).
// Daftar route di bawah dibaca manual dari agent-routes.ts + health-routes.ts (minus /healthz,
// yang memang sengaja dikecualikan dari auth). Kalau route baru ditambah di agent-routes.ts
// tanpa nambah entri di sini, test ini TIDAK otomatis mendeteksinya -- tapi setidaknya 20 route
// yang ada sekarang persisten dijaga di sini.
const PROTECTED_ROUTES: Array<{ method: "GET" | "POST" | "DELETE" | "PATCH"; url: string }> = [
  { method: "POST", url: "/api/activate" },
  { method: "POST", url: "/api/scan-lan" },
  { method: "POST", url: "/api/devices/ABC/pair" },
  { method: "DELETE", url: "/api/devices/ABC" },
  { method: "PATCH", url: "/api/devices/ABC/model" },
  { method: "POST", url: "/api/sync" },
  { method: "GET", url: "/api/activation-state" },
  { method: "GET", url: "/api/snapshot" },
  { method: "GET", url: "/api/broker-info" },
  { method: "POST", url: "/api/printers/dev1/command" },
  { method: "GET", url: "/api/credential-store-status" },
  { method: "GET", url: "/api/update-status" },
  { method: "POST", url: "/api/send-logs" },
  { method: "GET", url: "/api/devices/ABC/files?path=/" },
  { method: "POST", url: "/api/devices/ABC/files/upload?remotePath=/x" },
  { method: "GET", url: "/api/devices/ABC/files/download?remotePath=/x" },
  { method: "DELETE", url: "/api/devices/ABC/files?remotePath=/x" },
  { method: "POST", url: "/api/devices/ABC/files/rename" },
  { method: "GET", url: "/api/devices/ABC/files/parse-3mf?remotePath=/x" },
  { method: "GET", url: "/api/devices/ABC/files/thumbnail?remotePath=/x" },
];

function makeApp() {
  const store = new InMemoryCredentialStore();
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
  return createHttpServer(runtime, service);
}

describe("auth coverage -- semua route terproteksi 401 tanpa Bearer token", () => {
  it.each(PROTECTED_ROUTES)("$method $url -> 401 tanpa Authorization header", async ({ method, url }) => {
    const app = makeApp();
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
  });

  it.each(PROTECTED_ROUTES)("$method $url -> 401 dengan token salah", async ({ method, url }) => {
    const app = makeApp();
    const res = await app.inject({ method, url, headers: { authorization: "Bearer wrong-token" } });
    expect(res.statusCode).toBe(401);
  });

  it("/healthz TETAP dikecualikan (dokumentasi kontras -- bukan lupa didaftarkan di daftar di atas)", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("daftar route di atas persis 20, sesuai jumlah yang ditemukan reviewer akhir", () => {
    expect(PROTECTED_ROUTES.length).toBe(20);
  });
});
