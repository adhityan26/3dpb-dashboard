import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { AgentRuntime, AgentService } from "@3pb/agent-core";
import { createAuthHook } from "./auth";
import { registerHealthRoutes } from "./routes/health-routes";
import { registerAgentRoutes } from "./routes/agent-routes";

// Kode error koneksi TCP Node.js (gagal konek ke printer) + kode numerik balasan protokol FTP
// dari basic-ftp (FTPError.code selalu number, mis. 425/426/530) -- keduanya ciri khas kegagalan
// upstream (printer/FTPS), BUKAN bug daemon. Dipakai untuk memutuskan 502 vs 500 di bawah.
const UPSTREAM_CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
]);

function isUpstreamConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException & { code?: string | number }).code;
  if (typeof code === "number") return true; // FTPError dari basic-ftp
  if (typeof code === "string" && UPSTREAM_CONNECTION_ERROR_CODES.has(code)) return true;
  return false;
}

// 200MB: generous untuk file G-code/3MF print (biasanya puluhan MB), tapi tetap membatasi -- tanpa
// limit ini klien terautentikasi bisa upload sembarang besar dan memenuhi /tmp, yang di Pi target
// adalah PrivateTmp=yes (tmpfs, alias RAM), bukan disk. Diekspor supaya bisa diassert dari test.
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function createHttpServer(runtime: AgentRuntime, service: AgentService): FastifyInstance {
  const app = Fastify({ logger: false }); // pakai runtime.logger sendiri, bukan Fastify built-in logger
  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  // /healthz didaftarkan SEBELUM auth hook dipasang, dan auth hook mengecualikannya secara
  // eksplisit lewat perbandingan string path -- BUKAN karena urutan registrasi (onRequest hook
  // Fastify tetap jalan untuk SEMUA route apa pun urutan daftarnya). Perbandingan string
  // eksplisit di bawah ini SATU-SATUNYA yang membuat /healthz terbuka tanpa token.
  registerHealthRoutes(app, runtime);

  const authHook = createAuthHook(runtime.credentialStore, runtime.logger);
  app.addHook("onRequest", async (req, reply) => {
    // Strip query string sebelum bandingkan -- "/healthz?probe=1" (lazim dipakai tool monitoring)
    // harus tetap dianggap /healthz, bukan match exact-string yang gagal dan balik 401.
    const pathOnly = req.url.split("?")[0];
    if (pathOnly === "/healthz") return;
    await authHook(req, reply);
  });

  registerAgentRoutes(app, service);

  // Kontrak throw-vs-return AgentService: method operasi file THROW pada error. Handler tunggal
  // di sini memetakan itu ke status HTTP, bukan try/catch per-route.
  app.setErrorHandler((error, _req, reply) => {
    // Fastify/@fastify/multipart sudah menentukan statusCode sendiri untuk error yang dideteksi
    // di layer HTTP (body multipart melebihi limits.fileSize -> 413, content-type tidak valid ->
    // 400/415, body JSON malformed -> 400, dst) -- kalau sudah ada, itu paling akurat, jangan
    // ditimpa jadi 502/500 generik.
    const fastifyStatus = (error as { statusCode?: number }).statusCode;
    if (typeof fastifyStatus === "number" && fastifyStatus >= 400 && fastifyStatus < 600) {
      reply.code(fastifyStatus).send({ error: error.message });
      return;
    }

    if (error.message === "device_not_found") {
      reply.code(404).send({ error: "device_not_found" });
      return;
    }

    // Selain dua kasus di atas: error mentah TIDAK PERNAH dikirim ke klien (message/stack), hanya
    // dicatat lewat runtime.logger di sisi server. Hanya kegagalan yang benar-benar berciri
    // koneksi upstream (FTPS/printer) dipetakan ke 502 -- bug/exception daemon yang tak
    // terklasifikasi TIDAK BOLEH diam-diam lolos sebagai "upstream_error" 502, harus 500.
    runtime.logger.error("[agent-headless] unhandled route error", error);
    if (isUpstreamConnectionError(error)) {
      reply.code(502).send({ error: "upstream_error" });
      return;
    }
    reply.code(500).send({ error: "internal_error" });
  });

  return app;
}
