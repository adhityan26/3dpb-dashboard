import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "./agent-service";
import { AgentRuntime } from "./agent-runtime";
import { InMemoryCredentialStore } from "./in-memory-credential-store";
import * as saasClient from "./saas-client";
import * as discovery1 from "./discovery/bambu-ssdp";
import * as discovery2 from "./discovery/moonraker-mdns";
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
