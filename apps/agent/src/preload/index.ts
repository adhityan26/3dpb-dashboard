import { contextBridge, ipcRenderer } from "electron";
import type { DeviceSecret } from "../main/credential-store";
import type { FetchResult, SaasDevice } from "../main/saas-client";
import type { ScanResult } from "../main/discovery/bambu-ssdp";
import type { DiscoveredMoonrakerPrinter } from "../main/discovery/moonraker-mdns";
import type { PrintersPayload } from "@3pb/printer-monitor-core";
import type { ActivationState, SyncResult } from "../main/ipc";

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
  sync: (): Promise<SyncResult> => ipcRenderer.invoke("agent:sync"),
  getSnapshot: (): Promise<PrintersPayload> => ipcRenderer.invoke("agent:get-snapshot"),
  getBrokerInfo: (): Promise<{ ip: string; port: number | null }> =>
    ipcRenderer.invoke("agent:get-broker-info"),
  getActivationState: (): Promise<ActivationState> => ipcRenderer.invoke("agent:get-activation-state"),
};

export type AgentApi = typeof agentApi;

declare global {
  interface Window {
    agentApi: AgentApi;
  }
}

contextBridge.exposeInMainWorld("agentApi", agentApi);
