import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "./agent-runtime";
import { LocalBroker } from "./local-broker";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";
import type { CredentialBlob } from "./credential-store";
import type { Engine, MqttReporter } from "@3pb/printer-monitor-core";

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
});
