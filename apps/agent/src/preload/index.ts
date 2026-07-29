import { contextBridge, ipcRenderer } from "electron";
import type { DeviceSecret } from "../main/credential-store";

const agentApi = {
  activate: (token: string) => ipcRenderer.invoke("agent:activate", token),
  scanLan: () => ipcRenderer.invoke("agent:scan-lan"),
  pairDevice: (shortCode: string, secret: DeviceSecret) => ipcRenderer.invoke("agent:pair-device", shortCode, secret),
  sync: () => ipcRenderer.invoke("agent:sync"),
  getSnapshot: () => ipcRenderer.invoke("agent:get-snapshot"),
};

export type AgentApi = typeof agentApi;

contextBridge.exposeInMainWorld("agentApi", agentApi);
