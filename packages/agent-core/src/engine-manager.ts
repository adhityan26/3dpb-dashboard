import { Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter, HmsLookup } from "@3pb/printer-monitor-core";
import type { DeviceConfig, Connector } from "@3pb/printer-monitor-core";
import type { DeviceSecret } from "./credential-store";
import { hmsTable } from "./hms-table";
import { CYD_TYPE_FALLBACK } from "./printer-model";
import type { Logger } from "./interfaces";

export interface PairedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
  secret: DeviceSecret;
}

export interface StartedEngine {
  engine: Engine;
  reporters: MqttReporter[];
}

export async function startEngine(paired: PairedDevice[], brokerPort: number, pin: string, logger: Logger): Promise<StartedEngine> {
  const devices: DeviceConfig[] = [];
  const connectors: Connector[] = [];

  for (const p of paired) {
    if (p.printerType !== "bambu" && p.printerType !== "moonraker") {
      logger.warn(`[engine-manager] printerType tak didukung, di-skip: ${p.printerType} (${p.shortCode})`);
      continue;
    }
    const device: DeviceConfig = {
      id: p.shortCode,
      name: p.label,
      type: p.model?.trim() || CYD_TYPE_FALLBACK[p.printerType],
      connector: p.printerType,
      ip: p.secret.ip,
      serial: p.secret.serial || undefined,
      accessCode: p.secret.accessCode || undefined,
    };
    devices.push(device);
    try {
      connectors.push(
        p.printerType === "bambu" ? new BambuMqttConnector(device) : new MoonrakerConnector(device)
      );
    } catch (err) {
      logger.error(`[engine-manager] gagal bikin connector utk ${p.shortCode} (${p.printerType}) -- device ini TIDAK termonitor, device lain tetap jalan`, err);
    }
  }

  const reporter = new MqttReporter({
    url: `mqtt://127.0.0.1:${brokerPort}`,
    statusTopic: "3dpb/printers",
    password: pin,
  });
  await reporter.connect();

  const engine = new Engine({
    devices,
    connectors,
    reporters: [reporter],
    hms: new HmsLookup(hmsTable),
  });
  await engine.start();
  return { engine, reporters: [reporter] };
}
