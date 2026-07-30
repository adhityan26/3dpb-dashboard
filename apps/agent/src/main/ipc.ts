import { ipcMain } from "electron";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel, type SaasDevice } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { getEngine, setEngine, getBrokerPort, getLocalIp, getReporters, setReporters } from "./app-state";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";

export interface ActivationState {
  hasToken: boolean;
  devices: SaasDevice[];
  pairedShortCodes: string[];
}

// `kind` cuma diisi kalau kegagalannya SPESIFIK bisa dijelaskan ke user (model ditolak
// validasi) -- kegagalan generik (token hilang, network_error, dll) tetap `{ok:false}` polos,
// konsisten dengan kontrak `{ok:boolean}` yang sudah ada sejak Task 8 (final-review Fix 2b).
export type UpdateDeviceModelResult = { ok: boolean; kind?: "invalid_model" };

export type SyncResult =
  | { ok: true; deviceCount: number }
  | { ok: false; kind: "invalid_token" | "entitlement_expired" | "network_error" | "engine_error" | "broker_unavailable" };

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

  /**
   * Dipanggil PairingScreen sesudah pairing tersimpan, kalau user mengisi/mengubah model di
   * form pairing -- best-effort, non-blocking (spec §6): pairing lokal SUDAH selesai terlepas
   * dari hasil ini, jadi kegagalan di sini cuma balikin {ok:false} buat ditampilkan sebagai
   * peringatan ringan, BUKAN reject yang bisa dianggap "pairing gagal".
   */
  ipcMain.handle("agent:update-device-model", async (_event, shortCode: string, model: string): Promise<UpdateDeviceModelResult> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false };
    const result = await patchDeviceModel(blob.agentToken, shortCode, model);
    if (result.ok) return { ok: true };
    if (result.kind === "invalid_model") return { ok: false, kind: "invalid_model" };
    return { ok: false };
  });

  // Sync HARUS lakukan rekonsiliasi nyata (bukan cuma fetch dibuang) -- ini yang dipakai
  // "user edit layout/device di web -> klik Sync di Agent biar kepakai, gak nunggu restart
  // app" (design spec). Mirror persis apa yang bootstrap() lakukan di main/index.ts:
  // refresh device metadata (reconcileDevices, fallback cache kalau SaaS unreachable),
  // stop Engine lama, start Engine baru dgn device terkini, lalu republish layout.
  ipcMain.handle("agent:sync", async (): Promise<SyncResult> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, kind: "invalid_token" };

    const brokerPort = getBrokerPort();
    // Broker gak pernah jalan (mis. port 1883 dipakai proses lain saat startup, lihat
    // main/index.ts bootstrap()) -- tak ada broker buat Engine baru konek. brokerPort CUMA
    // null kalau broker gagal start SEJAK AWAL (setBrokerPort dipanggil PALING SEKALI, pas
    // bootstrap sukses) jadi kalau ini null, dipastikan juga belum pernah ada Engine/reporter
    // aktif buat direkonsiliasi. Balikin gagal EKSPLISIT -- BUKAN ok:true dengan deviceCount
    // yang menyesatkan (device sebenarnya nol yang termonitor), yang kontradiksi sama pesan
    // "broker belum jalan" yang sudah tampil di Dashboard yang sama (Task 13 review Minor #1).
    if (brokerPort === null) return { ok: false, kind: "broker_unavailable" };

    const { fetchResult, paired } = await reconcileDevices(blob.agentToken);

    const oldEngine = getEngine();
    if (oldEngine) await oldEngine.stop();
    // MqttReporter buka koneksi MQTT sendiri di connect() -- Engine.stop() (packages/
    // printer-monitor-core) CUMA stop connector+timer, tidak pernah menutup reporter-nya.
    // Tanpa ini, TIAP Sync yang restart Engine bikin 1 koneksi MQTT baru yang gak pernah
    // ditutup (leak — Task 13 review Important finding pasca fix-wave sebelumnya).
    for (const r of getReporters()) {
      await r.close().catch((err) => console.error("[ipc] agent:sync gagal tutup reporter lama", err));
    }
    setReporters([]);

    if (paired.length > 0) {
      try {
        const started = await startEngine(paired, brokerPort);
        setEngine(started.engine);
        setReporters(started.reporters);
      } catch (err) {
        console.error("[ipc] agent:sync gagal restart engine dengan device terbaru", err);
        setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      setEngine(null);
    }

    // Republish layout non-fatal -- kegagalannya gak boleh bikin seluruh Sync dianggap gagal
    // (device sudah kepasang duluan di atas), cukup dicatat.
    await publishLayout(blob.agentToken, brokerPort).catch((err) => {
      console.error("[ipc] agent:sync gagal republish layout (non-fatal)", err);
    });

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
