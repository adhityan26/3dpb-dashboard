import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "./agent-service";
import { AgentRuntime } from "./agent-runtime";
import { InMemoryCredentialStore } from "./in-memory-credential-store";
import * as saasClient from "./saas-client";
import * as discovery1 from "./discovery/bambu-ssdp";
import * as discovery2 from "./discovery/moonraker-mdns";
import * as startup from "./startup";
import * as engineManager from "./engine-manager";
import * as layoutPublisher from "./layout-publisher";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "./interfaces";

vi.mock("./saas-client", async () => {
  const actual = await vi.importActual<typeof import("./saas-client")>("./saas-client");
  return { ...actual, fetchDevices: vi.fn(), patchDeviceModel: vi.fn() };
});
vi.mock("./discovery/bambu-ssdp", async () => {
  const actual = await vi.importActual<typeof import("./discovery/bambu-ssdp")>("./discovery/bambu-ssdp");
  return { ...actual, scanBambu: vi.fn() };
});
vi.mock("./discovery/moonraker-mdns", async () => {
  const actual = await vi.importActual<typeof import("./discovery/moonraker-mdns")>("./discovery/moonraker-mdns");
  return { ...actual, scanMoonraker: vi.fn() };
});
vi.mock("./startup", async () => {
  const actual = await vi.importActual<typeof import("./startup")>("./startup");
  return { ...actual, reconcileDevices: vi.fn() };
});
vi.mock("./engine-manager", async () => {
  const actual = await vi.importActual<typeof import("./engine-manager")>("./engine-manager");
  return { ...actual, startEngine: vi.fn() };
});
vi.mock("./layout-publisher", async () => {
  const actual = await vi.importActual<typeof import("./layout-publisher")>("./layout-publisher");
  return { ...actual, publishLayout: vi.fn() };
});

function makeFixture(store = new InMemoryCredentialStore()) {
  const pathProvider: PathProvider = { userDataDir: () => "/fake" };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logFileProvider: LogFileProvider = { getLogFilePath: () => null };
  const buildInfo: BuildInfo = { version: "0.0.1", commitHash: "abc1234" };
  const runtime = new AgentRuntime({
    credentialStore: store, pathProvider, logger, logFileProvider, buildInfo,
    saasBaseUrl: "http://test.example.com", updatePlatform: "win",
  });
  const service = new AgentService(runtime);
  return { service, runtime, store, logger };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentService.activate", () => {
  it("fetchDevices ok -> simpan token, balikin result", async () => {
    const { service, store } = makeFixture();
    vi.mocked(saasClient.fetchDevices).mockResolvedValue({ ok: true, data: [] });
    const result = await service.activate("tok123");
    expect(result).toEqual({ ok: true, data: [] });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "tok123", devices: {} } });
  });

  it("fetchDevices gagal -> token TIDAK disimpan", async () => {
    const { service, store } = makeFixture();
    vi.mocked(saasClient.fetchDevices).mockResolvedValue({ ok: false, kind: "invalid_token" });
    await service.activate("bad");
    expect(await store.load()).toEqual({ status: "empty" });
  });
});

describe("AgentService.scanLan", () => {
  it("gabungkan hasil scanBambu + scanMoonraker", async () => {
    const { service } = makeFixture();
    vi.mocked(discovery1.scanBambu).mockResolvedValue({ ok: true, printers: [] });
    vi.mocked(discovery2.scanMoonraker).mockResolvedValue([]);
    expect(await service.scanLan()).toEqual({ bambu: { ok: true, printers: [] }, moonraker: [] });
  });
});

describe("AgentService.pairDevice / forgetDevice", () => {
  it("pairDevice: RMW blob.devices[shortCode] = secret", async () => {
    const { service, store } = makeFixture();
    const secret = { ip: "1.2.3.4", accessCode: "x", serial: "" };
    await service.pairDevice("ABC", secret);
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: null, devices: { ABC: secret } } });
  });

  it("forgetDevice: hapus dari blob.devices", async () => {
    const { service, store } = makeFixture(new InMemoryCredentialStore({ agentToken: null, devices: { ABC: { ip: "x", accessCode: "y", serial: "" } } }));
    await service.forgetDevice("ABC");
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: null, devices: {} } });
  });
});

describe("AgentService.updateDeviceModel", () => {
  it("tanpa agentToken -> ok:false", async () => {
    const { service } = makeFixture();
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: false });
  });

  it("patchDeviceModel sukses -> ok:true", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(saasClient.patchDeviceModel).mockResolvedValue({ ok: true, data: { model: "model-x" } });
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: true });
  });

  it("patchDeviceModel kind invalid_model -> diteruskan", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {} }));
    vi.mocked(saasClient.patchDeviceModel).mockResolvedValue({ ok: false, kind: "invalid_model" });
    expect(await service.updateDeviceModel("ABC", "model-x")).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("AgentService.getSnapshot / getBrokerInfo / sendPrinterCommand", () => {
  it("getSnapshot: tanpa engine -> {payload:[]}", async () => {
    const { service } = makeFixture();
    expect(await service.getSnapshot()).toEqual({ payload: [] });
  });

  it("getBrokerInfo: baca ip/port/pin dari runtime saat ini", async () => {
    const { service, runtime } = makeFixture();
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const result = await service.getBrokerInfo();
    expect(result.port).toBe(1883);
    expect(result.pin).toBe("1234");
  });

  it("sendPrinterCommand: tanpa engine -> engine_not_running", async () => {
    const { service } = makeFixture();
    expect(await service.sendPrinterCommand("dev1", { type: "pause" } as never)).toEqual({ ok: false, message: "engine_not_running" });
  });
});

describe("AgentService.getCredentialStoreStatus / getUpdateStatus", () => {
  it("baca state runtime saat ini (bukan snapshot beku)", async () => {
    const { service, runtime } = makeFixture();
    runtime.setCredentialStoreDegraded(true);
    expect(await service.getCredentialStoreStatus()).toEqual({ degraded: true });
    runtime.setUpdateAvailable(true);
    expect(await service.getUpdateStatus()).toEqual({ updateAvailable: true });
  });
});

describe("AgentService.sync", () => {
  it("tanpa agentToken -> invalid_token, tidak sentuh broker/engine", async () => {
    const { service } = makeFixture();
    expect(await service.sync()).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("brokerPort null -> broker_unavailable", async () => {
    const { service } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    expect(await service.sync()).toEqual({ ok: false, kind: "broker_unavailable" });
  });

  it("sukses dengan device paired -> teardownEngine dipanggil, engine baru di-start, layout di-republish, ok:true", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const teardownSpy = vi.spyOn(runtime, "teardownEngine");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "x", serial: "" } };
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [pairedDevice] });
    const fakeEngine = {};
    vi.mocked(engineManager.startEngine).mockResolvedValue({ engine: fakeEngine as never, reporters: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: true });

    const result = await service.sync();

    expect(teardownSpy).toHaveBeenCalledOnce();
    expect(engineManager.startEngine).toHaveBeenCalledWith([pairedDevice], 1883, "1234", runtime.logger);
    expect(runtime.getEngine()).toBe(fakeEngine);
    expect(layoutPublisher.publishLayout).toHaveBeenCalledWith(runtime.saasBaseUrl, "tok", 1883, "default", "1234", runtime.logger);
    expect(result).toEqual({ ok: true, deviceCount: 1 });
  });

  it("tanpa device paired -> engine di-set null, TETAP publish layout", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

    const result = await service.sync();

    expect(runtime.getEngine()).toBeNull();
    expect(layoutPublisher.publishLayout).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, deviceCount: 0 });
  });

  it("startEngine throw -> engine di-set null, ok:false engine_error, logger.error dipanggil", async () => {
    const { service, runtime, logger } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    const pairedDevice = { shortCode: "ABC", label: "A", printerType: "bambu", model: null, secret: { ip: "1.1.1.1", accessCode: "", serial: "" } };
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [pairedDevice] });
    vi.mocked(engineManager.startEngine).mockRejectedValue(new Error("accessCode kosong"));

    const result = await service.sync();

    expect(runtime.getEngine()).toBeNull();
    expect(result).toEqual({ ok: false, kind: "engine_error" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("fetchResult gagal -> tetap coba sync engine, tapi return fetchResult (bukan ok:true)", async () => {
    const { service, runtime } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockResolvedValue({ published: false });

    const result = await service.sync();

    expect(result).toEqual({ ok: false, kind: "network_error" });
  });

  it("publishLayout gagal (reject) -> non-fatal, sync tetap ok:true, logger.error dipanggil", async () => {
    const { service, runtime, logger } = makeFixture(new InMemoryCredentialStore({ agentToken: "tok", devices: {}, brokerPin: undefined }));
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("1234");
    vi.mocked(startup.reconcileDevices).mockResolvedValue({ fetchResult: { ok: true, data: [] }, devices: [], paired: [] });
    vi.mocked(layoutPublisher.publishLayout).mockRejectedValue(new Error("mqtt down"));

    const result = await service.sync();

    expect(result).toEqual({ ok: true, deviceCount: 0 });
    expect(logger.error).toHaveBeenCalled();
  });
});
