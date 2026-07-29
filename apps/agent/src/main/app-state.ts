import os from "node:os";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;
// MqttReporter(s) yang dibuat startEngine() bareng Engine yang lagi aktif. Engine.stop()
// (packages/printer-monitor-core) CUMA stop connector+timer, tidak pernah nutup reporter-nya
// sendiri -- jadi siapa pun yang ganti Engine (agent:sync) WAJIB juga nutup reporter lama
// lewat state ini, kalau tidak tiap restart bikin 1 koneksi MQTT baru yang gak pernah
// ditutup (leak, lihat Task 13 review post-fix-wave).
let reporters: MqttReporter[] = [];

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }
export function setReporters(r: MqttReporter[]): void { reporters = r; }
export function getReporters(): MqttReporter[] { return reporters; }

export function getLocalIp(): string {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "127.0.0.1";
}
