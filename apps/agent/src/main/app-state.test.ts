import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRuntime } from "@3pb/agent-core";
import {
  initRuntime, getRuntime,
  setEngine, getEngine, setBrokerPort, getBrokerPort, setBrokerPin, getBrokerPin,
  setReporters, getReporters, setUpdateAvailable, getUpdateAvailable,
  setCredentialStoreDegraded, getCredentialStoreDegraded,
} from "./app-state";
import type { CredentialStore, PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";
import type { CredentialBlob } from "@3pb/agent-core";
import type { Engine } from "@3pb/printer-monitor-core";

function makeRuntime(): AgentRuntime {
  const store: CredentialStore<CredentialBlob> = { load: vi.fn(), save: vi.fn(), isEncryptionAvailable: () => true };
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc" };
  return new AgentRuntime({ credentialStore: store, pathProvider, logger, logFileProvider, buildInfo, saasBaseUrl: "x", updatePlatform: "win" });
}

describe("app-state facade", () => {
  beforeEach(() => {
    initRuntime(makeRuntime());
  });

  it("initRuntime()/getRuntime() round-trip", () => {
    const runtime = makeRuntime();
    initRuntime(runtime);
    expect(getRuntime()).toBe(runtime);
  });

  it("setEngine/getEngine mendelegasikan ke runtime aktif", () => {
    const fakeEngine = {} as Engine;
    setEngine(fakeEngine);
    expect(getEngine()).toBe(fakeEngine);
    expect(getRuntime().getEngine()).toBe(fakeEngine);
  });

  it("setBrokerPort/getBrokerPort mendelegasikan ke runtime aktif", () => {
    setBrokerPort(1883);
    expect(getBrokerPort()).toBe(1883);
  });

  it("setBrokerPin/getBrokerPin mendelegasikan ke runtime aktif", () => {
    setBrokerPin("1234");
    expect(getBrokerPin()).toBe("1234");
  });

  it("setReporters/getReporters mendelegasikan ke runtime aktif", () => {
    setReporters([]);
    expect(getReporters()).toEqual([]);
  });

  it("setUpdateAvailable/getUpdateAvailable mendelegasikan ke runtime aktif", () => {
    setUpdateAvailable(true);
    expect(getUpdateAvailable()).toBe(true);
  });

  it("setCredentialStoreDegraded/getCredentialStoreDegraded mendelegasikan ke runtime aktif", () => {
    setCredentialStoreDegraded(true);
    expect(getCredentialStoreDegraded()).toBe(true);
  });

  it("mengganti runtime lewat initRuntime() lagi -> state lama tidak ikut, state baru independen", () => {
    setBrokerPort(1);
    initRuntime(makeRuntime());
    expect(getBrokerPort()).toBeNull();
  });
});
