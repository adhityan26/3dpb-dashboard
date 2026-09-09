import { ipcMain, shell, dialog } from "electron";
import { AgentService } from "@3pb/agent-core";
import { getRuntime } from "./app-state";
import type { DeviceSecret } from "@3pb/agent-core";
import type { AgentConfig } from "@3pb/agent-core";
import type { PrinterCommand } from "@3pb/printer-monitor-core";

export type { ActivationState, SyncResult, UpdateDeviceModelResult } from "@3pb/agent-core";

export function registerIpcHandlers(_config: AgentConfig): void {
  const runtime = getRuntime();
  const service = new AgentService(runtime);
  const baseUrl = runtime.saasBaseUrl;

  ipcMain.handle("agent:activate", (_event, token: string) => service.activate(token));
  ipcMain.handle("agent:scan-lan", () => service.scanLan());
  ipcMain.handle("agent:pair-device", (_event, shortCode: string, secret: DeviceSecret) => service.pairDevice(shortCode, secret));
  ipcMain.handle("agent:forget-device", (_event, shortCode: string) => service.forgetDevice(shortCode));
  ipcMain.handle("agent:update-device-model", (_event, shortCode: string, model: string) => service.updateDeviceModel(shortCode, model));
  ipcMain.handle("agent:sync", () => service.sync());
  ipcMain.handle("agent:get-activation-state", () => service.getActivationState());
  ipcMain.handle("agent:get-snapshot", () => service.getSnapshot());
  ipcMain.handle("agent:get-broker-info", () => service.getBrokerInfo());
  ipcMain.handle("agent:printer-command", (_event, deviceId: string, cmd: PrinterCommand) => service.sendPrinterCommand(deviceId, cmd));
  ipcMain.handle("agent:get-credential-store-status", () => service.getCredentialStoreStatus());
  ipcMain.handle("agent:get-update-status", () => service.getUpdateStatus());
  ipcMain.handle("agent:send-logs", () => service.sendLogs());
  ipcMain.handle("agent:file-list", (_event, shortCode: string, path: string) => service.listFiles(shortCode, path));
  ipcMain.handle("agent:file-upload", (_event, shortCode: string, localPath: string, remotePath: string) => service.uploadFile(shortCode, localPath, remotePath));
  ipcMain.handle("agent:file-download", (_event, shortCode: string, remotePath: string, localPath: string) => service.downloadFile(shortCode, remotePath, localPath));
  ipcMain.handle("agent:file-delete", (_event, shortCode: string, remotePath: string) => service.deleteFile(shortCode, remotePath));
  ipcMain.handle("agent:file-rename", (_event, shortCode: string, oldPath: string, newPath: string) => service.renameFile(shortCode, oldPath, newPath));
  ipcMain.handle("agent:file-parse-3mf", (_event, shortCode: string, remotePath: string) => service.parseThreemfForDevice(shortCode, remotePath));
  ipcMain.handle("agent:file-thumbnail", (_event, shortCode: string, remotePath: string) => service.getFileThumbnail(shortCode, remotePath));

  ipcMain.handle("agent:open-download-page", async () => {
    if (!baseUrl) return;
    await shell.openExternal(`${baseUrl}/settings`);
  });

  ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
