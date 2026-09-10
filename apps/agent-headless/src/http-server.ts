import Fastify, { type FastifyInstance } from "fastify";
import type { AgentRuntime, AgentService } from "@3pb/agent-core";
import { createAuthHook } from "./auth";
import { registerHealthRoutes } from "./routes/health-routes";
import { registerAgentRoutes } from "./routes/agent-routes";

export function createHttpServer(runtime: AgentRuntime, service: AgentService): FastifyInstance {
  const app = Fastify({ logger: false }); // pakai runtime.logger sendiri, bukan Fastify built-in logger

  // /healthz didaftarkan SEBELUM auth hook dipasang, dan auth hook mengecualikannya secara
  // eksplisit -- systemd/monitoring harus bisa cek kesehatan daemon tanpa token.
  registerHealthRoutes(app, runtime);

  const authHook = createAuthHook(runtime.credentialStore, runtime.logger);
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;
    await authHook(req, reply);
  });

  registerAgentRoutes(app, service);

  return app;
}
