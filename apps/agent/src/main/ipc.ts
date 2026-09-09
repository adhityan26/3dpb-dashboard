import { ipcMain, shell, dialog } from "electron";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import {
  loadCredentials, saveCredentials, type DeviceSecret,
  fetchDevices, patchDeviceModel, type SaasDevice, type SaasFailKind,
  uploadLogs,
  scanBambu, scanMoonraker,
  BambuFtpsClient, parseThreemf, type PlateInfo, type PrinterFileEntry,
  findPlateThumbnail, extractGcodeThumbnail,
  reconcileDevices,
} from "@3pb/agent-core";
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getReporters, setReporters, getUpdateAvailable, getCredentialStoreDegraded } from "./app-state";
import { getLocalIp } from "@3pb/agent-core";
import { startEngine } from "@3pb/agent-core";
import { publishLayout } from "@3pb/agent-core";
import { SafeStorageCredentialStore, ElectronPathProvider, ElectronLogAdapter, ElectronLogFileProvider, getElectronBuildInfo } from "./platform-electron";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
import type { AgentConfig } from "@3pb/agent-core";

// Instance singleton -- dibangun sekali per proses Electron, dioper eksplisit ke tiap
// pemanggilan fungsi core (functions module-level di agent-core TIDAK menyimpan state ini
// sendiri, semua dependency lewat parameter -- Plan A, lihat spec).
const credentialStore = new SafeStorageCredentialStore();
const pathProvider = new ElectronPathProvider();
const logger = new ElectronLogAdapter();
const logFileProvider = new ElectronLogFileProvider();
const buildInfo = getElectronBuildInfo();

// Dipertahankan (tak ada di kode contoh brief task-14, tapi preload/index.ts +
// renderer/screens/DashboardScreen.tsx MASIH mengimpor tipe-tipe ini dari "./ipc" -- kalau
// dihapus, tsc --noEmit gagal di file-file itu meski ipc.ts sendiri lulus. Bentuknya identik
// dengan definisi lama, cuma dipindah tetap di sini karena ini murni tipe return handler IPC
// lokal, bukan bagian dari kontrak @3pb/agent-core).
export interface ActivationState {
  hasToken: boolean;
  devices: SaasDevice[];
  pairedShortCodes: string[];
}

export type UpdateDeviceModelResult = { ok: boolean; kind?: "invalid_model" };

export type SyncResult =
  | { ok: true; deviceCount: number }
  | { ok: false; kind: SaasFailKind | "engine_error" | "broker_unavailable" };

export function registerIpcHandlers(config: AgentConfig): void {
  const baseUrl = config.saasBaseUrl;

  ipcMain.handle("agent:activate", async (_event, token: string) => {
    const result = await fetchDevices(baseUrl, token, buildInfo, logger);
    if (result.ok) {
      const blob = await loadCredentials(credentialStore);
      await saveCredentials(credentialStore, { ...blob, agentToken: token });
    }
    return result;
  });

  ipcMain.handle("agent:scan-lan", async () => {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  });

  ipcMain.handle("agent:pair-device", async (_event, shortCode: string, secret: DeviceSecret) => {
    const blob = await loadCredentials(credentialStore);
    blob.devices[shortCode] = secret;
    await saveCredentials(credentialStore, blob);
  });

  ipcMain.handle("agent:forget-device", async (_event, shortCode: string): Promise<void> => {
    const blob = await loadCredentials(credentialStore);
    delete blob.devices[shortCode];
    await saveCredentials(credentialStore, blob);
  });

  ipcMain.handle("agent:update-device-model", async (_event, shortCode: string, model: string) => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(baseUrl, blob.agentToken, shortCode, model);
    if (result.ok) return { ok: true };
    if (result.kind === "invalid_model") return { ok: false, kind: "invalid_model" };
    return { ok: false };
  });

  ipcMain.handle("agent:sync", async () => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

    const brokerPort = getBrokerPort();
    if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };
    const brokerPin = getBrokerPin() as string;

    const { fetchResult, paired } = await reconcileDevices(baseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);

    const oldEngine = getEngine();
    if (oldEngine) await oldEngine.stop();
    for (const r of getReporters()) {
      await r.close().catch((err) => logger.error("[ipc] agent:sync gagal tutup reporter lama", err));
    }
    setReporters([]);

    if (paired.length > 0) {
      try {
        const started = await startEngine(paired, brokerPort, brokerPin, logger);
        setEngine(started.engine);
        setReporters(started.reporters);
      } catch (err) {
        logger.error("[ipc] agent:sync gagal restart engine dengan device terbaru", err);
        setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      setEngine(null);
    }

    await publishLayout(baseUrl, blob.agentToken, brokerPort, "default", brokerPin, logger).catch((err) => {
      logger.error("[ipc] agent:sync gagal republish layout (non-fatal)", err);
    });

    if (!fetchResult.ok) return fetchResult;
    return { ok: true, deviceCount: paired.length };
  });

  ipcMain.handle("agent:get-activation-state", async () => {
    const blob = await loadCredentials(credentialStore);
    if (!blob.agentToken) return { hasToken: false, devices: [], pairedShortCodes: [] };
    const { devices, paired } = await reconcileDevices(baseUrl, credentialStore, pathProvider, blob.agentToken, buildInfo, logger);
    return { hasToken: true, devices, pairedShortCodes: paired.map((p) => p.shortCode) };
  });

  ipcMain.handle("agent:get-snapshot", async () => {
    return getEngine()?.snapshot() ?? { payload: [] };
  });

  ipcMain.handle("agent:get-broker-info", async () => {
    return { ip: getLocalIp(), port: getBrokerPort(), pin: getBrokerPin() };
  });

  ipcMain.handle("agent:printer-command", async (_event, deviceId: string, cmd: PrinterCommand): Promise<CommandResult> => {
    const engine = getEngine();
    if (!engine) return { ok: false, message: "engine_not_running" };
    return engine.sendCommand(deviceId, cmd);
  });

  ipcMain.handle("agent:get-credential-store-status", async () => {
    return { degraded: getCredentialStoreDegraded() };
  });

  ipcMain.handle("agent:get-update-status", async () => {
    return { updateAvailable: getUpdateAvailable() };
  });

  ipcMain.handle("agent:open-download-page", async () => {
    if (!baseUrl) return;
    await shell.openExternal(`${baseUrl}/settings`);
  });

  const MAX_LOG_BYTES = 5 * 1024 * 1024;

  ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean; reason?: string }> => {
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
    if (stats.size > MAX_LOG_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let content: Buffer;
    try {
      content = await readFile(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }

    return uploadLogs(baseUrl, blob.agentToken, content, logger);
  });

  async function getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
    const blob = await loadCredentials(credentialStore);
    const secret = blob.devices[shortCode];
    if (!secret) throw new Error("device_not_found");
    return new BambuFtpsClient(secret.ip, secret.accessCode);
  }

  ipcMain.handle("agent:file-list", async (_event, shortCode: string, path: string): Promise<PrinterFileEntry[]> => {
    const client = await getFileClientFor(shortCode);
    return client.list(path);
  });

  ipcMain.handle("agent:file-upload", async (_event, shortCode: string, localPath: string, remotePath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.upload(localPath, remotePath);
  });

  ipcMain.handle("agent:file-download", async (_event, shortCode: string, remotePath: string, localPath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.download(remotePath, localPath);
  });

  ipcMain.handle("agent:file-delete", async (_event, shortCode: string, remotePath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.delete(remotePath);
  });

  ipcMain.handle("agent:file-rename", async (_event, shortCode: string, oldPath: string, newPath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.rename(oldPath, newPath);
  });

  ipcMain.handle("agent:file-parse-3mf", async (_event, shortCode: string, remotePath: string): Promise<PlateInfo[]> => {
    const client = await getFileClientFor(shortCode);
    const fileName = remotePath.split("/").pop() ?? "download.gcode.3mf";
    const tempPath = join(tmpdir(), `agent-3mf-${Date.now()}-${randomUUID()}-${fileName}`);
    try {
      await client.download(remotePath, tempPath);
      const buffer = await readFile(tempPath);
      return await parseThreemf(buffer);
    } finally {
      await rm(tempPath, { force: true });
    }
  });

  ipcMain.handle("agent:file-thumbnail", async (_event, shortCode: string, remotePath: string): Promise<string | null> => {
    const isThreemf = remotePath.endsWith(".gcode.3mf");
    const isPlainGcode = !isThreemf && remotePath.endsWith(".gcode");
    if (!isThreemf && !isPlainGcode) return null;
    const client = await getFileClientFor(shortCode);
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
  });

  ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
