import type { AgentRuntime } from "./agent-runtime";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel } from "./saas-client";
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

  async sendLogs(): Promise<{ ok: boolean; reason?: string }> {
    throw new Error("not implemented — see Task 10");
  }

  async listFiles(_shortCode: string, _path: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async uploadFile(_shortCode: string, _localPath: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async downloadFile(_shortCode: string, _remotePath: string, _localPath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async deleteFile(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async renameFile(_shortCode: string, _oldPath: string, _newPath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async parseThreemf(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
  async getFileThumbnail(_shortCode: string, _remotePath: string): Promise<never> {
    throw new Error("not implemented — see Task 10");
  }
}
