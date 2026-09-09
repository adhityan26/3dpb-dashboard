import { AgentRuntime, type CredentialStore, type CredentialLoadResult, type CredentialBlob } from "@3pb/agent-core";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

// Facade SEMENTARA di atas satu AgentRuntime module-level, supaya ipc.ts/index.ts yang
// sudah ada (dan ipc.test.ts) tidak perlu berubah sama sekali sampai Task 11 me-rewire
// ipc.ts jadi wrapper AgentService, dan Task 14 menghapus facade ini sepenuhnya. Lihat
// urutan 5-langkah di docs/superpowers/specs/2026-09-08-agent-core-extraction-design.md.
//
// getRuntime() SENGAJA tidak throw kalau initRuntime() belum pernah dipanggil -- lazy-default
// ke AgentRuntime "kosong" yang berperilaku identik dengan app-state.ts versi lama (state
// default null/false/[], siap dipakai tanpa langkah init). Ini WAJIB supaya ipc.test.ts (yang
// memanipulasi setter/getter langsung tanpa pernah memanggil initRuntime()) tetap hijau tanpa
// perubahan apa pun sampai Task 11. Real wiring (SafeStorageCredentialStore, saasBaseUrl
// beneran, dst) baru dipasang lewat initRuntime() saat index.ts bootstrap (Task 7).
let runtime: AgentRuntime | null = null;

function makeDefaultRuntime(): AgentRuntime {
  const noopCredentialStore: CredentialStore<CredentialBlob> = {
    load: async (): Promise<CredentialLoadResult<CredentialBlob>> => ({ status: "empty" }),
    save: async () => {},
    isEncryptionAvailable: () => true,
  };
  return new AgentRuntime({
    credentialStore: noopCredentialStore,
    pathProvider: { userDataDir: () => "" },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    logFileProvider: { getLogFilePath: () => null },
    buildInfo: { version: "0.0.0", commitHash: "nogit" },
    saasBaseUrl: "",
    updatePlatform: process.platform === "darwin" ? "mac" : "win",
  });
}

export function initRuntime(r: AgentRuntime): void {
  runtime = r;
}

export function getRuntime(): AgentRuntime {
  if (!runtime) runtime = makeDefaultRuntime();
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
