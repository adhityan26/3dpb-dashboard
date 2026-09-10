import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { AgentRuntime, AgentService } from "@3pb/agent-core";
import { createAuthHook } from "./auth";
import { registerHealthRoutes } from "./routes/health-routes";
import { registerAgentRoutes } from "./routes/agent-routes";

export function createHttpServer(runtime: AgentRuntime, service: AgentService): FastifyInstance {
  const app = Fastify({ logger: false }); // pakai runtime.logger sendiri, bukan Fastify built-in logger
  app.register(multipart);

  // /healthz didaftarkan SEBELUM auth hook dipasang, dan auth hook mengecualikannya secara
  // eksplisit -- systemd/monitoring harus bisa cek kesehatan daemon tanpa token.
  registerHealthRoutes(app, runtime);

  const authHook = createAuthHook(runtime.credentialStore, runtime.logger);
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;
    await authHook(req, reply);
  });

  registerAgentRoutes(app, service);

  // Kontrak throw-vs-return AgentService: method operasi file THROW pada error. Handler tunggal
  // di sini memetakan itu ke status HTTP, bukan try/catch per-route.
  app.setErrorHandler((error, _req, reply) => {
    if (error.message === "device_not_found") {
      reply.code(404).send({ error: "device_not_found" });
      return;
    }
    // Error lain (dari operasi file / upstream printer) diperlakukan sebagai kegagalan upstream,
    // bukan bug daemon -- 502, dan pesan error mentah TIDAK dikirim ke klien (hanya dicatat lewat
    // runtime.logger di sisi server).
    runtime.logger.error("[agent-headless] unhandled route error", error);
    reply.code(502).send({ error: "upstream_error" });
  });

  return app;
}
