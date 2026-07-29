import { ipcMain } from "electron";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getEngine, getBrokerPort, getLocalIp } from "./app-state";

export function registerIpcHandlers(): void {
  ipcMain.handle("agent:activate", async (_event, token: string) => {
    const result = await fetchDevices(token);
    if (result.ok) {
      const blob = await loadCredentials();
      await saveCredentials({ ...blob, agentToken: token });
    }
    return result;
  });

  ipcMain.handle("agent:scan-lan", async () => {
    const [bambuResult, moonraker] = await Promise.all([scanBambu(), scanMoonraker()]);
    return { bambu: bambuResult, moonraker };
  });

  ipcMain.handle("agent:pair-device", async (_event, shortCode: string, secret: DeviceSecret) => {
    const blob = await loadCredentials();
    blob.devices[shortCode] = secret;
    await saveCredentials(blob);
  });

  ipcMain.handle("agent:sync", async () => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" as const };
    return fetchDevices(blob.agentToken);
  });

  // Baca nilai TERKINI tiap kali dipanggil (bukan snapshot beku saat registerIpcHandlers
  // dijalankan) — getEngine()/getBrokerPort() baca dari app-state.ts, bukan closure lokal.
  ipcMain.handle("agent:get-snapshot", async () => {
    return getEngine()?.snapshot() ?? { payload: [] };
  });

  ipcMain.handle("agent:get-broker-info", async () => {
    return { ip: getLocalIp(), port: getBrokerPort() };
  });
}
