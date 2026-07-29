import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  secret: DeviceSecret;
}

export async function startEngine(paired: PairedDevice[], brokerPort: number): Promise<Engine> {
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
      type: p.printerType,
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
    devices.push(device);
    connectors.push(
      p.printerType === "bambu" ? new BambuMqttConnector(device) : new MoonrakerConnector(device)
    );
  }

  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers", // WAJIB override — default reporter "3dpb/printers-v2" salah buat kontrak CYD
  });
  await reporter.connect();

  const engine = new Engine({
    devices,
    connectors,
    reporters: [reporter],
    hms: new HmsLookup(hmsTable), // inject eksplisit — hindari gotcha import.meta.url default loading
  });
  await engine.start();
  return engine;
}
