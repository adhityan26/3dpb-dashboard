import { describe, it, expect, vi } from "vitest";

const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
}));
vi.mock("./credential-store", () => ({ loadCredentials: vi.fn().mockResolvedValue({ agentToken: null, devices: {} }), saveCredentials: vi.fn() }));
vi.mock("./saas-client", () => ({ fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }), fetchLayout: vi.fn() }));
vi.mock("./discovery/bambu-ssdp", () => ({ scanBambu: vi.fn().mockResolvedValue({ ok: true, printers: [] }) }));
vi.mock("./discovery/moonraker-mdns", () => ({ scanMoonraker: vi.fn().mockResolvedValue([]) }));
vi.mock("./startup", () => ({ reconcileDevices: vi.fn() }));
vi.mock("./engine-manager", () => ({ startEngine: vi.fn() }));
vi.mock("./layout-publisher", () => ({ publishLayout: vi.fn().mockResolvedValue({ published: true }) }));

import { registerIpcHandlers } from "./ipc";
import { ipcMain } from "electron";
import { fetchDevices } from "./saas-client";
import { loadCredentials } from "./credential-store";
import { reconcileDevices } from "./startup";
import { startEngine } from "./engine-manager";
import { publishLayout } from "./layout-publisher";
import { getEngine, setEngine, setBrokerPort } from "./app-state";

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

  it("sukses: restart Engine dengan device terbaru, republish layout, balikin {ok:true, deviceCount}", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce(fakeEngine);

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883);
    expect(publishLayout).toHaveBeenCalledWith("slz_ok", 1883);
    expect(result).toEqual({ ok: true, deviceCount: 1 });
    expect(getEngine()).toBe(fakeEngine);

    setBrokerPort(null);
    setEngine(null);
  });

  it("SaaS unreachable tapi ada device ter-pairing dari cache -> Engine TETAP direstart dari cache, tapi hasil tetap ok:false (distinguishable dari sukses)", async () => {
    registerIpcHandlers();
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired });
    setBrokerPort(1883);
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce(fakeEngine);

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883);
    expect(result).toEqual({ ok: false, kind: "network_error" });

    setBrokerPort(null);
    setEngine(null);
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
