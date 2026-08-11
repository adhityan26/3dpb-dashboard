import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";
import { CYD_TYPE_FALLBACK } from "./printer-model";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
  secret: DeviceSecret;
}

export interface StartedEngine {
  engine: Engine;
  // MqttReporter(s) startEngine() bikin (buka koneksi MQTT sendiri di connect(), Engine.stop()
  // tidak pernah menutupnya) -- caller yang GANTI Engine ini WAJIB nutup reporter-nya juga
  // (r.close()), kalau tidak jadi leak 1 koneksi MQTT per restart. Dityped konkret sebagai
  // MqttReporter[] (bukan library-level Reporter[]) karena interface Reporter generik di
  // packages/printer-monitor-core sengaja TIDAK punya close() -- cuma implementasi MQTT ini
  // yang sebenarnya punya resource buat ditutup.
  reporters: MqttReporter[];
}

export async function startEngine(paired: PairedDevice[], brokerPort: number, pin: string): Promise<StartedEngine> {
  const devices: DeviceConfig[] = [];
  const connectors: Connector[] = [];

  for (const p of paired) {
    if (p.printerType !== "bambu" && p.printerType !== "moonraker") {
      console.warn(`[engine-manager] printerType tak didukung, di-skip: ${p.printerType} (${p.shortCode})`);
      continue;
    }
    const device: DeviceConfig = {
      id: p.shortCode, // WAJIB persis shortCode — kunci korelasi ke cell layout (Global Constraints)
      name: p.label,
      type: p.model?.trim() || CYD_TYPE_FALLBACK[p.printerType],
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
    devices.push(device);
    // BambuMqttConnector melempar error di constructor kalau serial/accessCode kosong (guard
    // yang memang dibutuhkan). Tanpa try/catch di sini, SATU device dengan secret salah (mis.
    // device slot ber-type "bambu" dipasangkan dengan info printer yang salah) bikin loop ini
    // throw dan SELURUH startEngine() gagal -- device LAIN yang secret-nya benar ikut tak
    // termonitor sama sekali (real incident). Device yang gagal construct TETAP masuk `devices`
    // (kelihatan di dashboard, statusnya OFFLINE/stale karena tak pernah dapat update) tapi
    // tanpa connector -- device lain tetap jalan normal.
    try {
      connectors.push(
        p.printerType === "bambu" ? new BambuMqttConnector(device) : new MoonrakerConnector(device)
      );
    } catch (err) {
      console.error(`[engine-manager] gagal bikin connector utk ${p.shortCode} (${p.printerType}) -- device ini TIDAK termonitor, device lain tetap jalan`, err);
    }
  }

  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers", // WAJIB override — default reporter "3dpb/printers-v2" salah buat kontrak CYD
    password: pin,
  });
  await reporter.connect();

  const engine = new Engine({
    devices,
    connectors,
    reporters: [reporter],
    hms: new HmsLookup(hmsTable), // inject eksplisit — hindari gotcha import.meta.url default loading
  });
  await engine.start();
  return { engine, reporters: [reporter] };
}
