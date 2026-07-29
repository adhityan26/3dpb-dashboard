import os from "node:os";
import type { Engine } from "@3pb/printer-monitor-core";

let engine: Engine | null = null;
let brokerPort: number | null = null;

export function setEngine(e: Engine | null): void { engine = e; }
export function getEngine(): Engine | null { return engine; }
export function setBrokerPort(port: number | null): void { brokerPort = port; }
export function getBrokerPort(): number | null { return brokerPort; }

export function getLocalIp(): string {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "127.0.0.1";
}
