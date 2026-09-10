import { AgentRuntime, AgentService, FileAesCredentialStore, loadOrCreateConfig } from "@3pb/agent-core";
import type { FastifyInstance } from "fastify";
import { NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo } from "./platform-node";
import { createHttpServer } from "./http-server";

const HTTP_PORT = 8080;

export interface BootstrapOptions {
  skipRuntimeStart?: boolean;
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<{ app: FastifyInstance; runtime: AgentRuntime }> {
  const pathProvider = new NodePathProvider();
  const logger = new NodeLogAdapter();
  const logFileProvider = new NodeLogFileProvider();
  const buildInfo = getNodeBuildInfo();
  const credentialStore = new FileAesCredentialStore(pathProvider.userDataDir());

  const config = await loadOrCreateConfig(pathProvider, process.env.SAAS_BASE_URL);

  // Pi maker sering sudah menjalankan mosquitto di 1883 -- EADDRINUSE bikin daemon jalan tanpa
  // broker/engine (start() tidak throw, tapi diam-diam degraded, lihat /healthz). Konfigurabel
  // lewat env var, pola sama seperti AGENT_DATA_DIR di platform-node.ts, bukan field AgentConfig
  // baru (lebih ringan, tidak menyentuh config.ts/loadOrCreateConfig).
  const brokerPortEnv = process.env.AGENT_BROKER_PORT;
  const brokerPort = brokerPortEnv ? Number(brokerPortEnv) : undefined;

  const runtime = new AgentRuntime({
    credentialStore,
    pathProvider,
    logger,
    logFileProvider,
    buildInfo,
    saasBaseUrl: config.saasBaseUrl,
    updatePlatform: "linux",
    brokerPort,
  });

  const service = new AgentService(runtime);
  const app = createHttpServer(runtime, service);

  // HTTP dulu, baru runtime.start() -- kebalikan urutan Electron. Wizard/CLI harus tetap bisa
  // diagnosa daemon selama bootstrap yang bisa lama (broker listen timeout 10s, fetch SaaS,
  // connector printer). AgentRuntime.start() sudah dijamin tidak pernah throw (invariant dari
  // sub-project 1), dan AgentService toleran runtime belum start (broker_unavailable, snapshot
  // kosong) -- jadi aman menerima request sebelum start() selesai.
  await app.listen({ port: HTTP_PORT, host: "0.0.0.0" });

  if (!opts.skipRuntimeStart) {
    await runtime.start();
  }

  return { app, runtime };
}

async function main(): Promise<void> {
  const { app, runtime } = await bootstrap();

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    await runtime.stop();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("unhandledRejection", (err) => {
    runtime.logger.error("[agent-headless] unhandled rejection", err);
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    runtime.logger.error("[agent-headless] uncaught exception", err);
    process.exit(1);
  });
}

// Hanya jalan kalau file ini dieksekusi langsung (node dist/index.mjs), bukan saat di-import
// oleh test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[agent-headless] bootstrap gagal total", err);
    process.exit(1);
  });
}
