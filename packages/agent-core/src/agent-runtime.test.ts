import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "./agent-runtime";
import { LocalBroker } from "./local-broker";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";
import * as credentialStoreModule from "./credential-store";
import * as startupModule from "./startup";
import * as engineManagerModule from "./engine-manager";
import * as layoutPublisherModule from "./layout-publisher";
import * as saasClientModule from "./saas-client";
import { InMemoryCredentialStore } from "./in-memory-credential-store";

vi.mock("./credential-store", async () => {
  const actual = await vi.importActual<typeof import("./credential-store")>("./credential-store");
  return { ...actual, ensureBrokerPin: vi.fn() };
});
vi.mock("./startup", async () => {
  const actual = await vi.importActual<typeof import("./startup")>("./startup");
  return { ...actual, buildPairedDevices: vi.fn() };
});
vi.mock("./engine-manager", async () => {
  const actual = await vi.importActual<typeof import("./engine-manager")>("./engine-manager");
  return { ...actual, startEngine: vi.fn() };
});
vi.mock("./layout-publisher", async () => {
  const actual = await vi.importActual<typeof import("./layout-publisher")>("./layout-publisher");
  return { ...actual, publishLayout: vi.fn() };
});
vi.mock("./saas-client", async () => {
  const actual = await vi.importActual<typeof import("./saas-client")>("./saas-client");
  return { ...actual, fetchLatestVersion: vi.fn() };
});

function makeDeps() {
  const store: CredentialStore<CredentialBlob> = {
    load: vi.fn(),
    save: vi.fn(),
    isEncryptionAvailable: () => true,
  };
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc1234" };
  return { store, pathProvider, logger, logFileProvider, buildInfo };
}

describe("AgentRuntime", () => {
  it("state getter/setter round-trip: engine, brokerPort, brokerPin, reporters, updateAvailable, credentialStoreDegraded", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store,
      pathProvider,
      logger,
      logFileProvider,
      buildInfo,
      saasBaseUrl: "http://test.example.com",
      updatePlatform: "win",
    });

    expect(runtime.getEngine()).toBeNull();
    const fakeEngine = {} as Engine;
    runtime.setEngine(fakeEngine);
    expect(runtime.getEngine()).toBe(fakeEngine);

    expect(runtime.getBrokerPort()).toBeNull();
    runtime.setBrokerPort(1883);
    expect(runtime.getBrokerPort()).toBe(1883);

    expect(runtime.getBrokerPin()).toBeNull();
    runtime.setBrokerPin("1234");
    expect(runtime.getBrokerPin()).toBe("1234");

    expect(runtime.getReporters()).toEqual([]);
    const fakeReporters = [{}] as MqttReporter[];
    runtime.setReporters(fakeReporters);
    expect(runtime.getReporters()).toBe(fakeReporters);

    expect(runtime.getUpdateAvailable()).toBe(false);
    runtime.setUpdateAvailable(true);
    expect(runtime.getUpdateAvailable()).toBe(true);

    expect(runtime.getCredentialStoreDegraded()).toBe(false);
    runtime.setCredentialStoreDegraded(true);
    expect(runtime.getCredentialStoreDegraded()).toBe(true);
  });

  it("dua instance AgentRuntime punya state independen (bukan singleton tersembunyi)", () => {
    const { store: storeA, ...restA } = makeDeps();
    const { store: storeB, ...restB } = makeDeps();
    const runtimeA = new AgentRuntime({ ...restA, credentialStore: storeA, saasBaseUrl: "a", updatePlatform: "win" });
    const runtimeB = new AgentRuntime({ ...restB, credentialStore: storeB, saasBaseUrl: "b", updatePlatform: "mac" });
    runtimeA.setBrokerPort(1);
    runtimeB.setBrokerPort(2);
    expect(runtimeA.getBrokerPort()).toBe(1);
    expect(runtimeB.getBrokerPort()).toBe(2);
  });

  it("broker default: kalau tidak dioper lewat constructor, bikin LocalBroker sendiri", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    expect(runtime.broker).toBeInstanceOf(LocalBroker);
  });

  it("broker bisa di-inject lewat constructor (buat test AgentRuntime tanpa aedes beneran)", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const fakeBroker = { start: vi.fn(), stop: vi.fn(), port: null } as unknown as LocalBroker;
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win", broker: fakeBroker,
    });
    expect(runtime.broker).toBe(fakeBroker);
  });

  it("brokerPort default 1883 kalau tidak dioper lewat constructor", () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    expect(runtime.configuredBrokerPort).toBe(1883);
  });

  it("teardownEngine(): stop engine lama LALU tutup semua reporter lama, urutan ini WAJIB", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const callOrder: string[] = [];
    const fakeEngine = { stop: vi.fn(async () => { callOrder.push("engine.stop"); }) } as unknown as Engine;
    const fakeReporter = { close: vi.fn(async () => { callOrder.push("reporter.close"); }) } as unknown as MqttReporter;
    runtime.setEngine(fakeEngine);
    runtime.setReporters([fakeReporter]);

    await runtime.teardownEngine();

    expect(callOrder).toEqual(["engine.stop", "reporter.close"]);
    expect(runtime.getEngine()).toBeNull();
    expect(runtime.getReporters()).toEqual([]);
  });

  it("teardownEngine(): tanpa engine lama -> tidak crash, reporter tetap ditutup", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const fakeReporter = { close: vi.fn(async () => {}) } as unknown as MqttReporter;
    runtime.setReporters([fakeReporter]);

    await runtime.teardownEngine();

    expect(fakeReporter.close).toHaveBeenCalledOnce();
    expect(runtime.getReporters()).toEqual([]);
  });

  it("teardownEngine(): reporter.close() gagal -> logger.error dipanggil, TIDAK throw, reporter list tetap dikosongkan", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const fakeReporter = { close: vi.fn(async () => { throw new Error("close gagal"); }) } as unknown as MqttReporter;
    runtime.setReporters([fakeReporter]);

    await expect(runtime.teardownEngine()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(runtime.getReporters()).toEqual([]);
  });

  it("teardownEngine(): engine.stop() gagal -> logger.error dipanggil, TIDAK throw, reporter tetap ditutup dan state tetap direset", async () => {
    const { store, pathProvider, logger, logFileProvider, buildInfo } = makeDeps();
    const runtime = new AgentRuntime({
      credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
      saasBaseUrl: "x", updatePlatform: "win",
    });
    const fakeEngine = { stop: vi.fn(async () => { throw new Error("engine.stop gagal"); }) } as unknown as Engine;
    const fakeReporter = { close: vi.fn(async () => {}) } as unknown as MqttReporter;
    runtime.setEngine(fakeEngine);
    runtime.setReporters([fakeReporter]);

    await expect(runtime.teardownEngine()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(fakeReporter.close).toHaveBeenCalledOnce();
    expect(runtime.getEngine()).toBeNull();
    expect(runtime.getReporters()).toEqual([]);
  });
});

function makeRuntimeForStartStop(store: CredentialStore<CredentialBlob> = new InMemoryCredentialStore()) {
  const pathProvider = { userDataDir: () => "/fake" };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider = { getLogFilePath: () => null };
  const buildInfo = { version: "0.0.1", commitHash: "abc1234" };
  const fakeBroker = {
    start: vi.fn().mockResolvedValue({ ok: true, port: 1883 }),
    stop: vi.fn().mockResolvedValue(undefined),
    port: 1883,
  };
  const runtime = new AgentRuntime({
    credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
    saasBaseUrl: "http://test.example.com", updatePlatform: "win",
    broker: fakeBroker as never,
  });
  return { runtime, logger, fakeBroker };
}

describe("AgentRuntime.start", () => {
  it("broker start sukses, tanpa device paired -> start selesai tanpa throw, engine tetap null", async () => {
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: null, devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);

    await expect(runtime.start()).resolves.toBeUndefined();
    expect(fakeBroker.start).toHaveBeenCalledWith(1883, "1234");
    expect(runtime.getEngine()).toBeNull();
  });

  it("broker gagal start -> start() TIDAK throw, tetap resolve", async () => {
    const { runtime, fakeBroker } = makeRuntimeForStartStop();
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    fakeBroker.start.mockResolvedValue({ ok: false, reason: "port_in_use" });

    await expect(runtime.start()).resolves.toBeUndefined();
  });

  it("startEngine throw di tengah start() -> publishLayout ikut TIDAK dipanggil (perilaku lama dipertahankan)", async () => {
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "", serial: "" } };
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([pairedDevice]);
    vi.mocked(engineManagerModule.startEngine).mockRejectedValue(new Error("accessCode kosong"));

    await runtime.start();

    expect(layoutPublisherModule.publishLayout).not.toHaveBeenCalled();
  });

  it("dengan agentToken -> publishLayout dipanggil setelah engine start sukses", async () => {
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);

    await runtime.start();

    expect(layoutPublisherModule.publishLayout).toHaveBeenCalledWith("http://test.example.com", "tok", 1883, "default", "1234", runtime.logger);
  });

  it("update-check timer mulai bahkan kalau broker gagal start (independen dari hasil start lainnya)", async () => {
    vi.useFakeTimers();
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    fakeBroker.start.mockResolvedValue({ ok: false, reason: "port_in_use" });
    vi.mocked(saasClientModule.fetchLatestVersion).mockResolvedValue({ ok: true, data: { updateAvailable: true } });

    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    expect(saasClientModule.fetchLatestVersion).toHaveBeenCalled();
    expect(runtime.getUpdateAvailable()).toBe(true);
    vi.useRealTimers();
  });

  it("update-check awal gagal (fetchLatestVersion reject) -> logger.error dipanggil, TIDAK unhandled rejection", async () => {
    vi.useFakeTimers();
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);
    vi.mocked(saasClientModule.fetchLatestVersion).mockRejectedValueOnce(new Error("network gagal"));

    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    expect(runtime.logger.error).toHaveBeenCalledWith("[agent-runtime] update check gagal", expect.any(Error));
    vi.useRealTimers();
  });

  it("update-check tick berikutnya (setInterval) gagal -> logger.error dipanggil, TIDAK unhandled rejection", async () => {
    vi.useFakeTimers();
    const { runtime } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);
    vi.mocked(saasClientModule.fetchLatestVersion).mockResolvedValueOnce({ ok: true, data: { updateAvailable: false } });

    await runtime.start();
    await vi.runOnlyPendingTimersAsync();

    vi.mocked(saasClientModule.fetchLatestVersion).mockRejectedValueOnce(new Error("network gagal lagi"));
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 + 1000);

    expect(runtime.logger.error).toHaveBeenCalledWith("[agent-runtime] update check gagal", expect.any(Error));
    vi.useRealTimers();
  });
});

describe("AgentRuntime.stop", () => {
  it("stop() memanggil teardownEngine(), broker.stop(), dan menghentikan timer update-check", async () => {
    vi.useFakeTimers();
    const { runtime, fakeBroker } = makeRuntimeForStartStop(new InMemoryCredentialStore({ agentToken: null, devices: {} }));
    vi.mocked(credentialStoreModule.ensureBrokerPin).mockResolvedValue("1234");
    vi.mocked(startupModule.buildPairedDevices).mockResolvedValue([]);
    vi.mocked(saasClientModule.fetchLatestVersion).mockResolvedValue({ ok: true, data: { updateAvailable: false } });
    const teardownSpy = vi.spyOn(runtime, "teardownEngine");

    await runtime.start();
    await vi.runOnlyPendingTimersAsync();
    const callsBeforeStop = vi.mocked(saasClientModule.fetchLatestVersion).mock.calls.length;

    await runtime.stop();

    expect(teardownSpy).toHaveBeenCalled();
    expect(fakeBroker.stop).toHaveBeenCalled();

    // Pastikan timer update-check benar-benar berhenti tick setelah stop() -- bukan cuma
    // clearInterval() dipanggil, tapi cek observable: fetchLatestVersion TIDAK dipanggil lagi.
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 + 1000);
    expect(vi.mocked(saasClientModule.fetchLatestVersion).mock.calls.length).toBe(callsBeforeStop);

    vi.useRealTimers();
  });

  it("stop() sebelum start() -> tidak throw", async () => {
    const { runtime } = makeRuntimeForStartStop();
    await expect(runtime.stop()).resolves.toBeUndefined();
  });
});
