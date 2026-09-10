import type { FastifyInstance } from "fastify";
import type { AgentService } from "@3pb/agent-core";
import type { DeviceSecret } from "@3pb/agent-core";
import type { PrinterCommand } from "@3pb/printer-monitor-core";

// 12 route non-file-operation yang delegasi langsung ke AgentService (parity dengan
// apps/agent/src/main/ipc.ts) -- file operations ditangani di task terpisah.
export function registerAgentRoutes(app: FastifyInstance, service: AgentService): void {
  app.post<{ Body: { token: string } }>("/api/activate", async (req) => {
    return service.activate(req.body.token);
  });

  app.post("/api/scan-lan", async () => {
    return service.scanLan();
  });

  app.post<{ Params: { shortCode: string }; Body: DeviceSecret }>("/api/devices/:shortCode/pair", async (req, reply) => {
    await service.pairDevice(req.params.shortCode, req.body);
    reply.code(204).send();
  });

  app.delete<{ Params: { shortCode: string } }>("/api/devices/:shortCode", async (req, reply) => {
    await service.forgetDevice(req.params.shortCode);
    reply.code(204).send();
  });

  app.patch<{ Params: { shortCode: string }; Body: { model: string } }>("/api/devices/:shortCode/model", async (req) => {
    return service.updateDeviceModel(req.params.shortCode, req.body.model);
  });

  app.post("/api/sync", async () => {
    return service.sync();
  });

  app.get("/api/activation-state", async () => {
    return service.getActivationState();
  });

  app.get("/api/snapshot", async () => {
    return service.getSnapshot();
  });

  app.get("/api/broker-info", async () => {
    return service.getBrokerInfo();
  });

  app.post<{ Params: { deviceId: string }; Body: PrinterCommand }>("/api/printers/:deviceId/command", async (req) => {
    return service.sendPrinterCommand(req.params.deviceId, req.body);
  });

  app.get("/api/credential-store-status", async () => {
    return service.getCredentialStoreStatus();
  });

  app.get("/api/update-status", async () => {
    return service.getUpdateStatus();
  });

  app.post("/api/send-logs", async () => {
    return service.sendLogs();
  });
}
