import { describe, it, expect, vi } from "vitest";

const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
}));
vi.mock("./credential-store", () => ({ loadCredentials: vi.fn().mockResolvedValue({ agentToken: null, devices: {} }), saveCredentials: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn(), patchDeviceModel: vi.fn() }));
vi.mock("./discovery/bambu-ssdp", () => ({ scanBambu: vi.fn().mockResolvedValue({ ok: true, printers: [] }) }));
vi.mock("./discovery/moonraker-mdns", () => ({ scanMoonraker: vi.fn().mockResolvedValue([]) }));
vi.mock("./startup", () => ({ reconcileDevices: vi.fn() }));
vi.mock("./engine-manager", () => ({ startEngine: vi.fn() }));
vi.mock("./layout-publisher", () => ({ publishLayout: vi.fn().mockResolvedValue({ published: true }) }));

import { registerIpcHandlers } from "./ipc";
import { ipcMain } from "electron";
import { fetchDevices, patchDeviceModel } from "./saas-client";
import { loadCredentials, saveCredentials } from "./credential-store";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { getEngine, setEngine, setBrokerPort, getReporters, setReporters } from "./app-state";

describe("registerIpcHandlers", () => {
  it("daftarkan handler 'agent:activate'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:activate", expect.any(Function));
  });

  it("'agent:activate' panggil fetchDevices dengan token yang dioper", async () => {
    registerIpcHandlers();
    await handlers["agent:activate"]({}, "slz_test_token");
    expect(fetchDevices).toHaveBeenCalledWith("slz_test_token");
  });

  it("daftarkan handler 'agent:scan-lan'", () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:scan-lan", expect.any(Function));
  });

  it("'agent:forget-device' hapus secret device dari credential-store, sisa device lain tak tersentuh", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({
      agentToken: "slz_ok",
      devices: {
        abc1234567: { ip: "1.2.3.4", serial: "S1", accessCode: "1111" },
        def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" },
      },
    });

    await handlers["agent:forget-device"]({}, "abc1234567");

    expect(saveCredentials).toHaveBeenCalledWith({
      agentToken: "slz_ok",
      devices: { def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" } },
    });
  });

  it("'agent:get-snapshot' baca getEngine() TERKINI tiap dipanggil, bukan snapshot beku saat register", async () => {
    registerIpcHandlers();
    setEngine(null);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [] });

    const fakeEngine = { snapshot: () => ({ payload: [{ id: "x" }] }) } as any;
    setEngine(fakeEngine);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [{ id: "x" }] });

    setEngine(null);
  });

  it("'agent:get-broker-info' baca getBrokerPort() TERKINI tiap dipanggil", async () => {
    registerIpcHandlers();
    setBrokerPort(1883);
    expect((await handlers["agent:get-broker-info"]()).port).toBe(1883);

    setBrokerPort(9999);
    expect((await handlers["agent:get-broker-info"]()).port).toBe(9999);

    setBrokerPort(null);
  });
});

describe("agent:sync", () => {
  it("belum ada token -> {ok:false, kind:'invalid_token'}, TANPA panggil reconcileDevices", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "invalid_token" });
    expect(reconcileDevices).not.toHaveBeenCalled();
  });

  it("broker gak pernah jalan (getBrokerPort()===null) -> {ok:false, kind:'broker_unavailable'}, TANPA panggil reconcileDevices/startEngine (Minor #1)", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    setBrokerPort(null);

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "broker_unavailable" });
    expect(reconcileDevices).not.toHaveBeenCalled();
    expect(startEngine).not.toHaveBeenCalled();
  });

  it("sukses: restart Engine dengan device terbaru, republish layout, balikin {ok:true, deviceCount}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    const fakeReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: fakeEngine, reporters: [fakeReporter] });

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883);
    expect(publishLayout).toHaveBeenCalledWith("slz_ok", 1883);
    expect(result).toEqual({ ok: true, deviceCount: 1 });
    expect(getEngine()).toBe(fakeEngine);
    expect(getReporters()).toEqual([fakeReporter]);

    setBrokerPort(null);
    setEngine(null);
    setReporters([]);
  });

  it("SaaS unreachable tapi ada device ter-pairing dari cache -> Engine TETAP direstart dari cache, tapi hasil tetap ok:false (distinguishable dari sukses)", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired });
    setBrokerPort(1883);
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: fakeEngine, reporters: [] });

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883);
    expect(result).toEqual({ ok: false, kind: "network_error" });

    setBrokerPort(null);
    setEngine(null);
    setReporters([]);
  });

  it("startEngine gagal (mis. accessCode salah) -> balikin {ok:false, kind:'engine_error'}, bukan reject/crash handler", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    (startEngine as any).mockRejectedValueOnce(new Error("boom"));

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "engine_error" });

    setBrokerPort(null);
    setEngine(null);
  });

  it("ganti Engine: Engine LAMA di-stop() SEBELUM Engine baru menggantikannya di app-state (Minor #2 -- urutan stop-before-restart belum ada test)", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);

    const callOrder: string[] = [];
    const oldEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn().mockImplementation(async () => { callOrder.push("old-engine-stopped"); }) } as any;
    setEngine(oldEngine);
    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockImplementationOnce(async () => {
      callOrder.push("new-engine-started");
      return { engine: newEngine, reporters: [] };
    });

    await handlers["agent:sync"]();

    expect(oldEngine.stop).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["old-engine-stopped", "new-engine-started"]);
    expect(getEngine()).toBe(newEngine); // Engine lama BENAR-BENAR diganti, bukan cuma di-stop lalu dibiarkan

    setBrokerPort(null);
    setEngine(null);
  });

  it("ganti Engine: reporter LAMA (mis. MqttReporter) di-close() sebelum diganti reporter baru -- TANPA ini tiap Sync leak 1 koneksi MQTT (Important finding)", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);

    const oldEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn().mockResolvedValue(undefined) } as any;
    const oldReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    setEngine(oldEngine);
    setReporters([oldReporter]);

    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    const newReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: newEngine, reporters: [newReporter] });

    await handlers["agent:sync"]();

    // Reporter LAMA harus ke-close() -- ini yang mencegah leak koneksi MQTT (bug utama yang
    // ditemukan review): tanpa baris ini, tiap klik Sync bikin 1 koneksi baru yang gak pernah
    // ditutup.
    expect(oldReporter.close).toHaveBeenCalledTimes(1);
    // Reporter yang dilacak app-state sekarang HARUS reporter yang baru, bukan lama ataupun
    // gabungan keduanya.
    expect(getReporters()).toEqual([newReporter]);

    setBrokerPort(null);
    setEngine(null);
    setReporters([]);
  });

  it("reporter lama gagal di-close() (mis. socket sudah putus) -> dicatat, TIDAK bikin seluruh Sync gagal", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);

    setEngine(null);
    setReporters([{ close: vi.fn().mockRejectedValue(new Error("socket sudah putus")) } as any]);
    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: newEngine, reporters: [] });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: true, deviceCount: 1 });

    setBrokerPort(null);
    setEngine(null);
    setReporters([]);
  });
});

describe("agent:get-activation-state", () => {
  it("belum ada token -> hasToken:false, devices:[], pairedShortCodes:[]", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    expect(await handlers["agent:get-activation-state"]()).toEqual({ hasToken: false, devices: [], pairedShortCodes: [] });
  });

  it("ada token -> hasToken:true, devices dari reconcileDevices, pairedShortCodes dari daftar paired", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: devices }, devices, paired });

    expect(await handlers["agent:get-activation-state"]()).toEqual({
      hasToken: true,
      devices,
      pairedShortCodes: ["abc1234567"],
    });
  });
});

describe("agent:update-device-model", () => {
  it("belum ada token -> {ok:false}, TANPA panggil patchDeviceModel", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
    expect(patchDeviceModel).not.toHaveBeenCalled();
  });

  it("ada token -> panggil patchDeviceModel dengan token+shortCode+model, balikin {ok:true} kalau sukses", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: true, data: { model: "P1S" } });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(patchDeviceModel).toHaveBeenCalledWith("slz_ok", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true });
  });

  it("patchDeviceModel gagal (mis. offline) -> {ok:false}, TIDAK throw", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: false, kind: "network_error" });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
  });

  it("patchDeviceModel gagal validasi (kind:invalid_model) -> {ok:false, kind:'invalid_model'} -- beda dari kegagalan network generik", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: false, kind: "invalid_model" });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "TerlaluPanjangUntukFirmware");

    expect(result).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("agent:printer-command", () => {
  it("engine belum jalan -> {ok:false, message:'engine_not_running'}", async () => {
    registerIpcHandlers();
    setEngine(null);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "pause" });
    expect(result).toEqual({ ok: false, message: "engine_not_running" });
  });

  it("delegasikan ke Engine.sendCommand dengan deviceId+cmd yang dioper apa adanya", async () => {
    registerIpcHandlers();
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    setEngine({ snapshot: () => ({ payload: [] }), sendCommand } as any);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "setSpeedLevel", level: 3 });
    expect(sendCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 });
    expect(result).toEqual({ ok: true });
    setEngine(null);
  });
});
