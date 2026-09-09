import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import { LocalBroker } from "./local-broker";
import { ensureBrokerPin, loadCredentials } from "./credential-store";
import { buildPairedDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { fetchLatestVersion } from "./saas-client";
import { listLocalIpCandidates } from "./local-network";

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

  private updateCheckTimer: NodeJS.Timeout | null = null;

  /**
   * Menyerap urutan bootstrap yang sebelumnya di apps/agent/src/main/index.ts (log SaaS base
   * URL/LAN IP -> cek kesehatan credential store -> resolve PIN -> start broker -> pair devices
   * -> start engine -> publish layout) plus startUpdateChecks(). TIDAK PERNAH throw -- kegagalan
   * di-log lewat this.logger, bukan dilempar, supaya host SELALU bisa daftarkan transport
   * (IPC/HTTP) sesudahnya apa pun yang terjadi di sini.
   *
   * update-check SENGAJA independen dari hasil bagian lain -- kalau broker gagal start,
   * update-check tetap mulai (lihat komentar asli di index.ts lama).
   */
  async start(): Promise<void> {
    try {
      if (this.saasBaseUrl) {
        this.logger.info(`[agent-runtime] SaaS base URL: ${this.saasBaseUrl}`);
      } else {
        this.logger.error(
          '[agent-runtime] SAAS_BASE_URL KOSONG — build ini tak tahu harus menghubungi server Slizebiz yang mana. ' +
            'Aktivasi/sync/layout PASTI gagal ("network_error"). Cek config.json di direktori data aplikasi.',
        );
      }
      this.logger.info('[agent-runtime] kandidat IP LAN (urut prioritas):', listLocalIpCandidates().join(', ') || '(tidak ada)');

      const credentialResult = await this.credentialStore.load();
      this.setCredentialStoreDegraded(credentialResult.status === 'degraded');
      if (credentialResult.status === 'degraded') {
        this.logger.error('[agent-runtime] penyimpanan kredensial lokal bermasalah (encryption tak tersedia atau file gagal didekripsi) -- PIN broker session-only, minta user restart/cek support');
      }

      const brokerPin = await ensureBrokerPin(this.credentialStore, this.logger);
      this.setBrokerPin(brokerPin);

      const brokerResult = await this.broker.start(this.configuredBrokerPort, brokerPin);
      if (!brokerResult.ok) {
        this.logger.error(`[agent-runtime] broker MQTT lokal gagal start (${brokerResult.reason}) — monitoring lokal tak akan jalan`);
        return;
      }
      this.setBrokerPort(brokerResult.port);

      const paired = await buildPairedDevices(this.saasBaseUrl, this.credentialStore, this.pathProvider, this.buildInfo, this.logger);
      if (paired.length > 0) {
        const started = await startEngine(paired, brokerResult.port, brokerPin, this.logger);
        this.setEngine(started.engine);
        this.setReporters(started.reporters);
      }

      const blob = await loadCredentials(this.credentialStore);
      if (blob.agentToken) {
        await publishLayout(this.saasBaseUrl, blob.agentToken, brokerResult.port, "default", brokerPin, this.logger);
      }
    } catch (err) {
      this.logger.error('[agent-runtime] start() gagal di tengah jalan (broker/engine/layout) — host tetap bisa daftarkan transport', err);
    } finally {
      this.startUpdateChecks();
    }
  }

  private startUpdateChecks(): void {
    const check = async () => {
      const blob = await loadCredentials(this.credentialStore);
      if (!blob.agentToken) return;
      const result = await fetchLatestVersion(this.saasBaseUrl, blob.agentToken, this.updatePlatform, this.buildInfo, this.logger);
      if (result.ok) this.setUpdateAvailable(result.data.updateAvailable);
    };
    void check();
    this.updateCheckTimer = setInterval(check, 6 * 60 * 60 * 1000);
    this.updateCheckTimer.unref?.();
  }

  async stop(): Promise<void> {
    await this.teardownEngine();
    await this.broker.stop();
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }
  }
}
