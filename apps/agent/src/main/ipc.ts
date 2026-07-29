import { ipcMain } from "electron";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, type SaasDevice } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getEngine, setEngine, getBrokerPort, getLocalIp } from "./app-state";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";

export interface ActivationState {
  hasToken: boolean;
  devices: SaasDevice[];
  pairedShortCodes: string[];
}

export type SyncResult =
  | { ok: true; deviceCount: number }
  | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" | "engine_error" };

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

  // Sync HARUS lakukan rekonsiliasi nyata (bukan cuma fetch dibuang) -- ini yang dipakai
  // "user edit layout/device di web -> klik Sync di Agent biar kepakai, gak nunggu restart
  // app" (design spec). Mirror persis apa yang bootstrap() lakukan di main/index.ts:
  // refresh device metadata (reconcileDevices, fallback cache kalau SaaS unreachable),
  // stop Engine lama, start Engine baru dgn device terkini, lalu republish layout.
  ipcMain.handle("agent:sync", async (): Promise<SyncResult> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

    const { fetchResult, paired } = await reconcileDevices(blob.agentToken);
    const brokerPort = getBrokerPort();

    const oldEngine = getEngine();
    if (oldEngine) await oldEngine.stop();

    if (paired.length > 0 && brokerPort !== null) {
      try {
        setEngine(await startEngine(paired, brokerPort));
      } catch (err) {
        console.error("[ipc] agent:sync gagal restart engine dengan device terbaru", err);
        setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      setEngine(null);
    }

    if (brokerPort !== null) {
      // Republish layout non-fatal -- kegagalannya gak boleh bikin seluruh Sync dianggap gagal
      // (device sudah kepasang duluan di atas), cukup dicatat.
      await publishLayout(blob.agentToken, brokerPort).catch((err) => {
        console.error("[ipc] agent:sync gagal republish layout (non-fatal)", err);
      });
    }

    if (!fetchResult.ok) return fetchResult;
    return { ok: true, deviceCount: paired.length };
  });

  // Dipanggil App.tsx sekali di awal buat tahu: sudah pernah aktivasi (ada token
  // tersimpan)? device apa aja yang terdaftar? mana yang SUDAH dipasangkan (secret-nya ada
  // di credential-store)? -- biar user tak perlu ulang aktivasi+pairing tiap buka app
  // (Task 13 review Finding 2).
  ipcMain.handle("agent:get-activation-state", async (): Promise<ActivationState> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { hasToken: false, devices: [], pairedShortCodes: [] };

    const { devices, paired } = await reconcileDevices(blob.agentToken);
    return { hasToken: true, devices, pairedShortCodes: paired.map((p) => p.shortCode) };
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
