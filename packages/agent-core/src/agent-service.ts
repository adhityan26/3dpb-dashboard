import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import type { AgentRuntime } from "./agent-runtime";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel, uploadLogs } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getLocalIp } from "./local-network";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
import type { ActivationState, SyncResult, UpdateDeviceModelResult } from "./agent-service-types";
import type { FetchResult } from "./saas-client";
import type { SaasDevice } from "./saas-client";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { BambuFtpsClient } from "./file-manager/bambu-ftps-client";
import { parseThreemf, type PlateInfo } from "./file-manager/threemf-parser";
import { findPlateThumbnail, extractGcodeThumbnail } from "./file-manager/thumbnail";
import type { PrinterFileEntry } from "./file-manager/types";

/**
 * Kontrak transport-agnostic yang dipakai Electron IPC sekarang dan HTTP/WS daemon nanti
 * (sub-project 2) — jangan diseragamkan tanpa audit semua caller:
 * - Method operasi file (listFiles/uploadFile/downloadFile/deleteFile/renameFile/
 *   parseThreemfForDevice/getFileThumbnail) THROW pada error (mis. Error("device_not_found"),
 *   error FTPS mentah) -- Electron IPC otomatis serialisasi jadi rejected promise di renderer;
 *   transport HTTP nanti butuh mapping eksplisit throw -> status code.
 * - Method lainnya RETURN discriminated union ({ok:false, kind:...}), tidak pernah throw untuk
 *   kegagalan yang diharapkan (network error, token invalid, dsb).
 * - sync() TIDAK re-entrant -- dua panggilan bersamaan bisa race pada teardownEngine()/
 *   startEngine(). Aman di Electron IPC sekarang (butuh klik ganda cepat), tapi WAJIB dikasih
 *   guard coalescing in-flight sebelum sub-project 2 (HTTP concurrent) mulai -- lihat "Out of
 *   scope" di spec agent-core-extraction-design.md.
 */
export class AgentService {
  constructor(private readonly runtime: AgentRuntime) {}

  async activate(token: string): Promise<FetchResult<SaasDevice[]>> {
    const { saasBaseUrl, buildInfo, logger, credentialStore } = this.runtime;
    const result = await fetchDevices(saasBaseUrl, token, buildInfo, logger);
    if (result.ok) {
      const blob = await loadCredentials(credentialStore);
      await saveCredentials(credentialStore, { ...blob, agentToken: token });
    }
    return result;
  }

  async scanLan(): Promise<{ bambu: Awaited<ReturnType<typeof scanBambu>>; moonraker: Awaited<ReturnType<typeof scanMoonraker>> }> {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  }

  async pairDevice(shortCode: string, secret: DeviceSecret): Promise<void> {
    const { credentialStore } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    blob.devices[shortCode] = secret;
    await saveCredentials(credentialStore, blob);
  }

  async forgetDevice(shortCode: string): Promise<void> {
    const { credentialStore } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    delete blob.devices[shortCode];
    await saveCredentials(credentialStore, blob);
  }

  async updateDeviceModel(shortCode: string, model: string): Promise<UpdateDeviceModelResult> {
    const { credentialStore, saasBaseUrl } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(saasBaseUrl, blob.agentToken, shortCode, model);
    if (result.ok) return { ok: true };
    if (result.kind === "invalid_model") return { ok: false, kind: "invalid_model" };
    return { ok: false };
  }

  async sync(): Promise<SyncResult> {
    const { credentialStore, saasBaseUrl, pathProvider, buildInfo, logger } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

    const brokerPort = this.runtime.getBrokerPort();
    if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };
    const brokerPin = this.runtime.getBrokerPin() as string;

    const { fetchResult, paired } = await reconcileDevices(saasBaseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);

    await this.runtime.teardownEngine();

    if (paired.length > 0) {
      try {
        const started = await startEngine(paired, brokerPort, brokerPin, logger);
        this.runtime.setEngine(started.engine);
        this.runtime.setReporters(started.reporters);
      } catch (err) {
        logger.error("[agent-service] sync gagal restart engine dengan device terbaru", err);
        this.runtime.setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      this.runtime.setEngine(null);
    }

    await publishLayout(saasBaseUrl, blob.agentToken, brokerPort, "default", brokerPin, logger).catch((err) => {
      logger.error("[agent-service] sync gagal republish layout (non-fatal)", err);
    });

    if (!fetchResult.ok) return fetchResult;
    return { ok: true, deviceCount: paired.length };
  }

  async getActivationState(): Promise<ActivationState> {
    const { credentialStore, saasBaseUrl, pathProvider, buildInfo, logger } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { hasToken: false, devices: [], pairedShortCodes: [] };
    const { devices, paired } = await reconcileDevices(saasBaseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);
    return { hasToken: true, devices, pairedShortCodes: paired.map((p) => p.shortCode) };
  }

  async getSnapshot() {
    return this.runtime.getEngine()?.snapshot() ?? { payload: [] };
  }

  async getBrokerInfo() {
    return { ip: getLocalIp(), port: this.runtime.getBrokerPort(), pin: this.runtime.getBrokerPin() };
  }

  async sendPrinterCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> {
    const engine = this.runtime.getEngine();
    if (!engine) return { ok: false, message: "engine_not_running" };
    return engine.sendCommand(deviceId, cmd);
  }

  async getCredentialStoreStatus() {
    return { degraded: this.runtime.getCredentialStoreDegraded() };
  }

  async getUpdateStatus() {
    return { updateAvailable: this.runtime.getUpdateAvailable() };
  }

  private static readonly MAX_LOG_BYTES = 5 * 1024 * 1024;

  async sendLogs(): Promise<{ ok: boolean; reason?: string }> {
    const { credentialStore, logFileProvider, saasBaseUrl, logger } = this.runtime;
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false, reason: "no_token" };

    const logPath = logFileProvider.getLogFilePath();
    if (!logPath) return { ok: false, reason: "read_failed" };

    let stats;
    try {
      stats = await stat(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    if (stats.size > AgentService.MAX_LOG_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let content: Buffer;
    try {
      content = await readFile(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }

    return uploadLogs(saasBaseUrl, blob.agentToken, content, logger);
  }

  private async getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
    const blob = await loadCredentials(this.runtime.credentialStore);
    const secret = blob.devices[shortCode];
    if (!secret) throw new Error("device_not_found");
    return new BambuFtpsClient(secret.ip, secret.accessCode);
  }

  async listFiles(shortCode: string, path: string): Promise<PrinterFileEntry[]> {
    const client = await this.getFileClientFor(shortCode);
    return client.list(path);
  }

  async uploadFile(shortCode: string, localPath: string, remotePath: string): Promise<void> {
    const client = await this.getFileClientFor(shortCode);
    await client.upload(localPath, remotePath);
  }

  async downloadFile(shortCode: string, remotePath: string, localPath: string): Promise<void> {
    const client = await this.getFileClientFor(shortCode);
    await client.download(remotePath, localPath);
  }

  async deleteFile(shortCode: string, remotePath: string): Promise<void> {
    const client = await this.getFileClientFor(shortCode);
    await client.delete(remotePath);
  }

  async renameFile(shortCode: string, oldPath: string, newPath: string): Promise<void> {
    const client = await this.getFileClientFor(shortCode);
    await client.rename(oldPath, newPath);
  }

  async parseThreemfForDevice(shortCode: string, remotePath: string): Promise<PlateInfo[]> {
    const client = await this.getFileClientFor(shortCode);
    const fileName = remotePath.split("/").pop() ?? "download.gcode.3mf";
    const tempPath = join(tmpdir(), `agent-3mf-${Date.now()}-${randomUUID()}-${fileName}`);
    try {
      await client.download(remotePath, tempPath);
      const buffer = await readFile(tempPath);
      return await parseThreemf(buffer);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async getFileThumbnail(shortCode: string, remotePath: string): Promise<string | null> {
    const isThreemf = remotePath.endsWith(".gcode.3mf");
    const isPlainGcode = !isThreemf && remotePath.endsWith(".gcode");
    if (!isThreemf && !isPlainGcode) return null;
    const client = await this.getFileClientFor(shortCode);
    const fileName = remotePath.split("/").pop() ?? "thumb";
    const tempPath = join(tmpdir(), `agent-thumb-${Date.now()}-${randomUUID()}-${fileName}`);
    try {
      await client.download(remotePath, tempPath);
      if (isPlainGcode) {
        const text = await readFile(tempPath, "utf8");
        return extractGcodeThumbnail(text);
      }
      const buffer = await readFile(tempPath);
      const zip = await JSZip.loadAsync(buffer);
      const png = findPlateThumbnail(zip);
      if (!png) return null;
      const base64 = await png.async("base64");
      return `data:image/png;base64,${base64}`;
    } catch {
      return null;
    } finally {
      await rm(tempPath, { force: true });
    }
  }
}
