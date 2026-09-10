import type { FastifyInstance } from "fastify";
import type { AgentRuntime } from "@3pb/agent-core";

export function registerHealthRoutes(app: FastifyInstance, runtime: AgentRuntime): void {
  app.get("/healthz", async () => {
    return {
      httpOk: true,
      brokerPort: runtime.getBrokerPort(),
      engineRunning: runtime.getEngine() !== null,
      credentialStoreDegraded: runtime.getCredentialStoreDegraded(),
    };
  });
}
