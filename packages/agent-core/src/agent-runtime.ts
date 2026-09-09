import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import { LocalBroker } from "./local-broker";

export interface AgentRuntimeDeps {
  credentialStore: CredentialStore<CredentialBlob>;
  pathProvider: PathProvider;
  logger: Logger;
  logFileProvider: LogFileProvider;
  buildInfo: BuildInfo;
  saasBaseUrl: string;
  updatePlatform: "win" | "mac";
  brokerPort?: number;
  broker?: LocalBroker;
}

/**
 * Menyerap state module-level yang sebelumnya di apps/agent/src/main/app-state.ts (engine,
 * reporters, brokerPort, brokerPin, updateAvailable, credentialStoreDegraded) plus satu
 * LocalBroker per instance -- supaya bisa dites tanpa hook reset manual, dan supaya prinsip
 * "satu akun per daemon" (satu AgentRuntime per proses) eksplisit lewat instance, bukan
 * implisit lewat module scope.
 */
export class AgentRuntime {
  readonly credentialStore: CredentialStore<CredentialBlob>;
  readonly pathProvider: PathProvider;
  readonly logger: Logger;
  readonly logFileProvider: LogFileProvider;
  readonly buildInfo: BuildInfo;
  readonly saasBaseUrl: string;
  readonly updatePlatform: "win" | "mac";
  readonly configuredBrokerPort: number;
  readonly broker: LocalBroker;

  private engine: Engine | null = null;
  private reporters: MqttReporter[] = [];
  private brokerPort: number | null = null;
  private brokerPin: string | null = null;
  private updateAvailable = false;
  private credentialStoreDegraded = false;

  constructor(deps: AgentRuntimeDeps) {
    this.credentialStore = deps.credentialStore;
    this.pathProvider = deps.pathProvider;
    this.logger = deps.logger;
    this.logFileProvider = deps.logFileProvider;
    this.buildInfo = deps.buildInfo;
    this.saasBaseUrl = deps.saasBaseUrl;
    this.updatePlatform = deps.updatePlatform;
    this.configuredBrokerPort = deps.brokerPort ?? 1883;
    this.broker = deps.broker ?? new LocalBroker(deps.logger);
  }

  setEngine(e: Engine | null): void { this.engine = e; }
  getEngine(): Engine | null { return this.engine; }
  setBrokerPort(port: number | null): void { this.brokerPort = port; }
  getBrokerPort(): number | null { return this.brokerPort; }
  setBrokerPin(pin: string | null): void { this.brokerPin = pin; }
  getBrokerPin(): string | null { return this.brokerPin; }
  setReporters(r: MqttReporter[]): void { this.reporters = r; }
  getReporters(): MqttReporter[] { return this.reporters; }
  setUpdateAvailable(available: boolean): void { this.updateAvailable = available; }
  getUpdateAvailable(): boolean { return this.updateAvailable; }
  setCredentialStoreDegraded(degraded: boolean): void { this.credentialStoreDegraded = degraded; }
  getCredentialStoreDegraded(): boolean { return this.credentialStoreDegraded; }

  /**
   * WAJIB dipakai oleh sync() (AgentService) DAN stop() (Task 12) -- satu-satunya tempat
   * urutan stop-engine-lalu-tutup-reporter ditulis. Engine.stop() (packages/printer-monitor-core)
   * TIDAK PERNAH menutup reporter-nya sendiri, jadi siapa pun yang mengganti/mematikan Engine
   * WAJIB juga menutup reporter lama lewat method ini -- kalau tidak, tiap restart bikin 1
   * koneksi MQTT baru yang tak pernah ditutup (leak).
   */
  async teardownEngine(): Promise<void> {
    const oldEngine = this.engine;
    if (oldEngine) await oldEngine.stop();
    for (const r of this.reporters) {
      await r.close().catch((err) => this.logger.error("[agent-runtime] gagal tutup reporter lama", err));
    }
    this.engine = null;
    this.reporters = [];
  }
}
