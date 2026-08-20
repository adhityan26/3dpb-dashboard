import { contextBridge, ipcRenderer } from "electron";
import type { DeviceSecret } from "../main/credential-store";
import type { FetchResult, SaasDevice } from "../main/saas-client";
import type { ScanResult } from "../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../main/discovery/moonraker-mdns";
import type { PrintersPayload, PrinterCommand, CommandResult } from "@3pb/printer-monitor-core";
import type { ActivationState, SyncResult, UpdateDeviceModelResult } from "../main/ipc";
import type { PrinterFileEntry } from "../main/file-manager/types";
import type { PlateInfo } from "../main/file-manager/threemf-parser";

// Tipe return tiap method di-anotasi EKSPLISIT (bukan cuma `typeof agentApi` inherit
// `Promise<any>` dari `ipcRenderer.invoke`) — dan HARUS persis cocok dengan tipe return
// asli handler-nya di `ipc.ts`, bukan sekadar deskripsi Interfaces-nya task brief.
// Contoh nyata bedanya: `scanLan` mengembalikan `bambu: ScanResult` (varian
// `{ok:true; printers:[...]}` | `{ok:false; reason:"port_in_use"}`, sengaja mempertahankan
// sinyal port_in_use dari Task 5), BUKAN bare `DiscoveredBambuPrinter[]`.
const agentApi = {
  activate: (token: string): Promise<FetchResult<SaasDevice[]>> => ipcRenderer.invoke("agent:activate", token),
  scanLan: (): Promise<{ bambu: ScanResult; moonraker: DiscoveredMoonrakerPrinter[] }> =>
    ipcRenderer.invoke("agent:scan-lan"),
  pairDevice: (shortCode: string, secret: DeviceSecret): Promise<void> =>
    ipcRenderer.invoke("agent:pair-device", shortCode, secret),
  forgetDevice: (shortCode: string): Promise<void> => ipcRenderer.invoke("agent:forget-device", shortCode),
  updateDeviceModel: (shortCode: string, model: string): Promise<UpdateDeviceModelResult> =>
    ipcRenderer.invoke("agent:update-device-model", shortCode, model),
  sync: (): Promise<SyncResult> => ipcRenderer.invoke("agent:sync"),
  getSnapshot: (): Promise<PrintersPayload> => ipcRenderer.invoke("agent:get-snapshot"),
  getBrokerInfo: (): Promise<{ ip: string; port: number | null; pin: string | null }> =>
    ipcRenderer.invoke("agent:get-broker-info"),
  getActivationState: (): Promise<ActivationState> => ipcRenderer.invoke("agent:get-activation-state"),
  sendPrinterCommand: (deviceId: string, cmd: PrinterCommand): Promise<CommandResult> =>
    ipcRenderer.invoke("agent:printer-command", deviceId, cmd),
  getUpdateStatus: (): Promise<{ updateAvailable: boolean }> =>
    ipcRenderer.invoke("agent:get-update-status"),
  openDownloadPage: (): Promise<void> =>
    ipcRenderer.invoke("agent:open-download-page"),
  sendLogs: (): Promise<{ ok: boolean; reason?: string }> => ipcRenderer.invoke("agent:send-logs"),
  getCredentialStoreStatus: (): Promise<{ degraded: boolean }> =>
    ipcRenderer.invoke("agent:get-credential-store-status"),
  listFiles: (shortCode: string, path: string): Promise<PrinterFileEntry[]> =>
    ipcRenderer.invoke("agent:file-list", shortCode, path),
  uploadFile: (shortCode: string, localPath: string, remotePath: string): Promise<void> =>
    ipcRenderer.invoke("agent:file-upload", shortCode, localPath, remotePath),
  downloadFile: (shortCode: string, remotePath: string, localPath: string): Promise<void> =>
    ipcRenderer.invoke("agent:file-download", shortCode, remotePath, localPath),
  deleteFile: (shortCode: string, remotePath: string): Promise<void> =>
    ipcRenderer.invoke("agent:file-delete", shortCode, remotePath),
  renameFile: (shortCode: string, oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke("agent:file-rename", shortCode, oldPath, newPath),
  parseThreemf: (shortCode: string, remotePath: string): Promise<PlateInfo[]> =>
    ipcRenderer.invoke("agent:file-parse-3mf", shortCode, remotePath),
};

export type AgentApi = typeof agentApi;

declare global {
  interface Window {
    agentApi: AgentApi;
  }
}

contextBridge.exposeInMainWorld("agentApi", agentApi);
