import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { AgentService } from "@3pb/agent-core";
import type { DeviceSecret } from "@3pb/agent-core";
import type { PrinterCommand } from "@3pb/printer-monitor-core";
import { relayUpload, relayDownload } from "../file-transfer";

// 12 route non-file-operation yang delegasi langsung ke AgentService (parity dengan
// apps/agent/src/main/ipc.ts), ditambah 7 route file-operation (upload/download/list/delete/
// rename/parse-3mf/thumbnail) yang relay lewat file-transfer.ts -- localPath TIDAK PERNAH
// diekspos ke klien HTTP.
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

  app.get<{ Params: { shortCode: string }; Querystring: { path: string } }>("/api/devices/:shortCode/files", async (req) => {
    return service.listFiles(req.params.shortCode, req.query.path);
  });

  // Upload: klien kirim multipart/form-data, request.file() dari @fastify/multipart -- stream-nya
  // di-relay ke temp file lokal daemon (bukan path dari klien) baru diteruskan ke service.
  app.post<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>(
    "/api/devices/:shortCode/files/upload",
    async (req) => {
      const data = await req.file();
      if (!data) throw new Error("no file in upload request");
      await relayUpload(service, req.params.shortCode, req.query.remotePath, data.file);
    },
  );

  // Download: file remote di-tarik ke temp file lokal daemon dulu, baru di-stream ke klien.
  // Cleanup temp file didaftarkan ke event 'close' response mentah -- HARUS setelah stream
  // selesai terkirim, bukan langsung setelah `return reply.send(...)` (yang cuma mendaftarkan
  // stream, belum selesai mengirim).
  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>(
    "/api/devices/:shortCode/files/download",
    async (req, reply) => {
      const { tempPath, cleanup } = await relayDownload(service, req.params.shortCode, req.query.remotePath);
      const stream = createReadStream(tempPath);
      reply.raw.on("close", () => {
        void cleanup();
      });
      reply.header("Content-Type", "application/octet-stream");
      return reply.send(stream);
    },
  );

  app.delete<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>(
    "/api/devices/:shortCode/files",
    async (req, reply) => {
      await service.deleteFile(req.params.shortCode, req.query.remotePath);
      reply.code(204).send();
    },
  );

  app.post<{ Params: { shortCode: string }; Body: { oldPath: string; newPath: string } }>(
    "/api/devices/:shortCode/files/rename",
    async (req, reply) => {
      await service.renameFile(req.params.shortCode, req.body.oldPath, req.body.newPath);
      reply.code(204).send();
    },
  );

  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>(
    "/api/devices/:shortCode/files/parse-3mf",
    async (req) => {
      return service.parseThreemfForDevice(req.params.shortCode, req.query.remotePath);
    },
  );

  app.get<{ Params: { shortCode: string }; Querystring: { remotePath: string } }>(
    "/api/devices/:shortCode/files/thumbnail",
    async (req, reply) => {
      const dataUrl = await service.getFileThumbnail(req.params.shortCode, req.query.remotePath);
      if (!dataUrl) {
        reply.code(404).send();
        return;
      }
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      reply.header("Content-Type", "image/png");
      reply.send(Buffer.from(base64, "base64"));
    },
  );
}
