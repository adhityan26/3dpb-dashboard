import type { AgentRuntime } from "@3pb/agent-core";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

// Facade SEMENTARA di atas satu AgentRuntime module-level, supaya ipc.ts/index.ts yang
// sudah ada (dan ipc.test.ts) tidak perlu berubah sama sekali sampai Task 11 me-rewire
// ipc.ts jadi wrapper AgentService, dan Task 14 menghapus facade ini sepenuhnya. Lihat
// urutan 5-langkah di docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md.
let runtime: AgentRuntime | null = null;

export function initRuntime(r: AgentRuntime): void {
  runtime = r;
}

export function getRuntime(): AgentRuntime {
  if (!runtime) throw new Error("AgentRuntime belum di-init -- panggil initRuntime() di awal bootstrap()");
  return runtime;
}

export function setEngine(e: Engine | null): void { getRuntime().setEngine(e); }
export function getEngine(): Engine | null { return getRuntime().getEngine(); }
export function setBrokerPort(port: number | null): void { getRuntime().setBrokerPort(port); }
export function getBrokerPort(): number | null { return getRuntime().getBrokerPort(); }
export function setBrokerPin(pin: string | null): void { getRuntime().setBrokerPin(pin); }
export function getBrokerPin(): string | null { return getRuntime().getBrokerPin(); }
export function setReporters(r: MqttReporter[]): void { getRuntime().setReporters(r); }
export function getReporters(): MqttReporter[] { return getRuntime().getReporters(); }
export function setUpdateAvailable(available: boolean): void { getRuntime().setUpdateAvailable(available); }
export function getUpdateAvailable(): boolean { return getRuntime().getUpdateAvailable(); }
export function setCredentialStoreDegraded(degraded: boolean): void { getRuntime().setCredentialStoreDegraded(degraded); }
export function getCredentialStoreDegraded(): boolean { return getRuntime().getCredentialStoreDegraded(); }
