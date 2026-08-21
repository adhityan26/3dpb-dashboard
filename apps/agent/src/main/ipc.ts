import { ipcMain, shell, dialog } from "electron";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import log from "electron-log/main";
import { loadCredentials, saveCredentials, type DeviceSecret } from "./credential-store";
import { fetchDevices, patchDeviceModel, saasBaseUrl, type SaasDevice } from "./saas-client";
import { scanBambu } from "./discovery/bambu-ssdp";
import { scanMoonraker } from "./discovery/moonraker-mdns";
import { BambuFtpsClient } from "./file-manager/bambu-ftps-client";
import { parseThreemf, type PlateInfo } from "./file-manager/threemf-parser";
import type { PrinterFileEntry } from "./file-manager/types";
import { getEngine, setEngine, getBrokerPort, getBrokerPin, getLocalIp, getReporters, setReporters, getUpdateAvailable, getCredentialStoreDegraded } from "./app-state";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";

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

  // Kebalikan agent:pair-device -- hapus secret device (mis. salah pasang printer fisik ke
  // slot device yang salah), biar PairingScreen anggap device itu belum dipasangkan lagi dan
  // user bisa isi ulang IP/serial/access code yang benar. TIDAK memicu Sync/restart Engine di
  // sini (v1 sengaja minimal) -- koneksi lama baru benar-benar berhenti setelah user
  // menyelesaikan pairing ulang (lewat onAllPaired -> initialSync di Dashboard) atau klik Sync
  // manual.
  ipcMain.handle("agent:forget-device", async (_event, shortCode: string): Promise<void> => {
    const blob = await loadCredentials();
    delete blob.devices[shortCode];
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
    const brokerPin = getBrokerPin() as string; // non-null past the guard above — bootstrap() always sets brokerPin BEFORE brokerPort (broker.ts's authenticate handler needs the final PIN before server.listen()), and only sets brokerPort at all if startBroker() succeeds — so brokerPort non-null implies brokerPin non-null, even though they aren't set "together"

    const { fetchResult, paired } = await reconcileDevices(blob.agentToken);

    const oldEngine = getEngine();
    if (oldEngine) await oldEngine.stop();
    // MqttReporter buka koneksi MQTT sendiri di connect() -- Engine.stop() (packages/
    // printer-monitor-core) CUMA stop connector+timer, tidak pernah menutup reporter-nya.
    // Tanpa ini, TIAP Sync yang restart Engine bikin 1 koneksi MQTT baru yang gak pernah
    // ditutup (leak — Task 13 review Important finding pasca fix-wave sebelumnya).
    for (const r of getReporters()) {
      await r.close().catch((err) => log.error("[ipc] agent:sync gagal tutup reporter lama", err));
    }
    setReporters([]);

    if (paired.length > 0) {
      try {
        const started = await startEngine(paired, brokerPort, brokerPin);
        setEngine(started.engine);
        setReporters(started.reporters);
      } catch (err) {
        log.error("[ipc] agent:sync gagal restart engine dengan device terbaru", err);
        setEngine(null);
        return { ok: false, kind: "engine_error" };
      }
    } else {
      setEngine(null);
    }

    // Republish layout non-fatal -- kegagalannya gak boleh bikin seluruh Sync dianggap gagal
    // (device sudah kepasang duluan di atas), cukup dicatat.
    await publishLayout(blob.agentToken, brokerPort, "default", brokerPin).catch((err) => {
      log.error("[ipc] agent:sync gagal republish layout (non-fatal)", err);
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
    return { ip: getLocalIp(), port: getBrokerPort(), pin: getBrokerPin() };
  });

  // Kirim command kontrol (pause/resume/stop/speed) ke printer tertentu -- device yang tak
  // lagi dimonitor Engine balikin device_not_found lewat Engine.sendCommand sendiri; di sini
  // cuma jaga kasus Engine belum pernah start sama sekali (mis. belum ada device dipasangkan).
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
    const base = saasBaseUrl();
    if (!base) return; // dev-config error already logged loudly at startup (index.ts) -- silent no-op here, not a second error path
    await shell.openExternal(`${base}/settings`);
  });

  const MAX_LOG_BYTES = 5 * 1024 * 1024;

  ipcMain.handle("agent:send-logs", async (): Promise<{ ok: boolean; reason?: string }> => {
    const blob = await loadCredentials();
    if (!blob.agentToken) return { ok: false, reason: "no_token" };

    const logPath = log.transports.file.getFile().path;
    let stats;
    try {
      stats = await stat(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    // Check client-side before even reading the file, so an oversized log fails fast with
    // a distinct message -- the server enforces the same cap independently (Task 8), this
    // is purely a faster/clearer UX path.
    if (stats.size > MAX_LOG_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let content: Buffer;
    try {
      content = await readFile(logPath);
    } catch {
      return { ok: false, reason: "read_failed" };
    }

    const res = await fetch(`${saasBaseUrl()}/api/agent/logs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${blob.agentToken}`, "Content-Type": "text/plain" },
      // Cast needed: this TypeScript/@types-node combo types Buffer as Buffer<ArrayBufferLike>,
      // which structurally no longer satisfies fetch's BodyInit -- Buffer is a real Uint8Array
      // at runtime and Node's fetch accepts it directly, this is a type-level mismatch only.
      body: content as unknown as BodyInit,
    }).catch(() => null);
    return res?.ok === true ? { ok: true } : { ok: false, reason: "upload_failed" };
  });

  async function getFileClientFor(shortCode: string): Promise<BambuFtpsClient> {
    const blob = await loadCredentials();
    const secret = blob.devices[shortCode];
    if (!secret) throw new Error("device_not_found");
    return new BambuFtpsClient(secret.ip, secret.accessCode);
  }

  ipcMain.handle("agent:file-list", async (_event, shortCode: string, path: string): Promise<PrinterFileEntry[]> => {
    const client = await getFileClientFor(shortCode);
    return client.list(path);
  });

  ipcMain.handle(
    "agent:file-upload",
    async (_event, shortCode: string, localPath: string, remotePath: string): Promise<void> => {
      const client = await getFileClientFor(shortCode);
      await client.upload(localPath, remotePath);
    }
  );

  ipcMain.handle(
    "agent:file-download",
    async (_event, shortCode: string, remotePath: string, localPath: string): Promise<void> => {
      const client = await getFileClientFor(shortCode);
      await client.download(remotePath, localPath);
    }
  );

  ipcMain.handle("agent:file-delete", async (_event, shortCode: string, remotePath: string): Promise<void> => {
    const client = await getFileClientFor(shortCode);
    await client.delete(remotePath);
  });

  ipcMain.handle(
    "agent:file-rename",
    async (_event, shortCode: string, oldPath: string, newPath: string): Promise<void> => {
      const client = await getFileClientFor(shortCode);
      await client.rename(oldPath, newPath);
    }
  );

  // Download file .gcode.3mf dari printer ke temp lokal, parse metadata plate/filament-nya,
  // lalu hapus file temp -- dipakai PrintStartDialog (Task 7) buat tampilkan plate & filament
  // sebelum user mulai print, dan FileDropOverlay (Task 8) buat auto-parse file yang di-drop.
  // rm(...,{force:true}) di `finally` -- cleanup HARUS jalan baik parseThreemf sukses maupun
  // gagal (mis. not_bambu_3mf), biar temp dir gak numpuk sisa download tiap kali parse gagal.
  ipcMain.handle(
    "agent:file-parse-3mf",
    async (_event, shortCode: string, remotePath: string): Promise<PlateInfo[]> => {
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
    }
  );

  // Cari file thumbnail plate di dalam zip .gcode.3mf. Coba plate_1.png dulu (paling umum),
  // lalu plate_1_small.png (varian lebih kecil yang selalu ada bareng plate_1.png di file 3mf
  // asli -- lihat riset vault bambu-3mf-gcode-metadata), lalu fallback ke plate_N.png pertama
  // yang ketemu (urutan angka) kalau plate_1 tak ada sama sekali (kasus file project yang
  // plate pertamanya sudah dihapus user di slicer).
  function findPlateThumbnail(zip: JSZip): JSZip.JSZipObject | null {
    return (
      zip.file("Metadata/plate_1.png") ??
      zip.file("Metadata/plate_1_small.png") ??
      (() => {
        const names = Object.keys(zip.files ?? {})
          .filter((n) => /^Metadata\/plate_\d+\.png$/.test(n))
          .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
        return names.length > 0 ? zip.file(names[0]) : null;
      })()
    );
  }

  // Ekstrak thumbnail base64 yang di-embed slicer di header komentar file .gcode POLOS
  // (bukan .gcode.3mf) -- format "; thumbnail begin WxH size" ... "; thumbnail end", satu
  // baris base64 per baris komentar. **ASUMSI SEMENTARA, BELUM DIVERIFIKASI** -- ini konvensi
  // umum PrusaSlicer/OrcaSlicer (basis slicer Bambu Studio), tapi belum dikonfirmasi terhadap
  // file .gcode Bambu asli. Kalau formatnya beda, fungsi ini cuma balikin null (placeholder
  // tampil, bukan crash) -- verifikasi manual terhadap file .gcode nyata dari printer Bambu
  // wajib sebelum fitur ini dianggap final untuk kasus plain-gcode (lihat
  // docs/superpowers/plans/2026-08-20-agent-file-manager-print.md untuk pola verifikasi serupa).
  function extractGcodeThumbnail(text: string): string | null {
    const match = text.match(/;\s*thumbnail begin[^\n]*\n([\s\S]*?)\n;\s*thumbnail end/i);
    if (!match) return null;
    const base64 = match[1]
      .split("\n")
      .map((line) => line.replace(/^;\s?/, "").trim())
      .join("");
    if (!base64) return null;
    return `data:image/png;base64,${base64}`;
  }

  // Ekstrak thumbnail preview, dipakai FileManagerPanel buat render kolom preview di tabel
  // file. Pola temp-file sama seperti agent:file-parse-3mf di atas -- randomUUID() disisipkan
  // di nama file temp buat menghindari race collision antar panggilan bersamaan (carry-forward
  // finding dari Task 4). Kegagalan apapun (ekstensi tak didukung, download gagal, tak ada
  // thumbnail di dalam file, dll) balikin null -- BUKAN throw -- karena ini cuma preview
  // kosmetik, bukan aksi kritikal seperti parse-3mf.
  ipcMain.handle(
    "agent:file-thumbnail",
    async (_event, shortCode: string, remotePath: string): Promise<string | null> => {
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
    }
  );

  // Native folder-picker dipakai FileManagerPanel (Task 6) buat bulk download -- user pilih
  // folder tujuan sekali, dipakai buat semua file terpilih.
  ipcMain.handle("agent:pick-download-folder", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
