import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const handlers: Record<string, (...args: any[]) => any> = {};
const { mockShowOpenDialog } = vi.hoisted(() => ({ mockShowOpenDialog: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/fake/userdata") },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC(${s})`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace(/^ENC\(/, "").replace(/\)$/, "")),
  },
  ipcMain: { handle: vi.fn((channel: string, fn: any) => { handlers[channel] = fn; }) },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: mockShowOpenDialog },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    transports: { file: { getFile: () => ({ path: "/tmp/mock-agent.log" }) } },
  },
}));

// Vitest's Node built-in module interop requires a "default" export alongside the named
// ones -- without it, importing this mock throws at module-load time before any test
// runs, not just the ones that touch stat/readFile.
vi.mock("node:fs/promises", () => {
  const stat = vi.fn();
  const readFile = vi.fn();
  const rm = vi.fn().mockResolvedValue(undefined);
  return { stat, readFile, rm, default: { stat, readFile, rm } };
});

const { mockParseThreemf } = vi.hoisted(() => ({ mockParseThreemf: vi.fn() }));

const { mockFileClient, MockBambuFtpsClient } = vi.hoisted(() => {
  const mockFileClient = {
    list: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
  };
  const MockBambuFtpsClient = vi.fn().mockImplementation(() => mockFileClient);
  return { mockFileClient, MockBambuFtpsClient };
});

// Semua fungsi/kelas dari @3pb/agent-core yang dulunya di-mock terpisah per file lokal
// (credential-store, saas-client, discovery/*, file-manager/*, engine-manager, startup,
// layout-publisher) sekarang datang dari satu paket -- jadi satu vi.mock partial-module,
// pola sama seperti engine-manager.test.ts lama untuk @3pb/printer-monitor-core.
// findPlateThumbnail/extractGcodeThumbnail dibiarkan ASLI (actual) -- keduanya pure function
// tanpa I/O, tetap diuji lewat perilaku nyatanya di test file-thumbnail di bawah.
vi.mock("@3pb/agent-core", async () => {
  const actual = await vi.importActual("@3pb/agent-core");
  return {
    ...actual,
    loadCredentials: vi.fn().mockResolvedValue({ agentToken: null, devices: {} }),
    saveCredentials: vi.fn(),
    fetchDevices: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    patchDeviceModel: vi.fn(),
    uploadLogs: vi.fn(),
    scanBambu: vi.fn().mockResolvedValue({ ok: true, printers: [] }),
    scanMoonraker: vi.fn().mockResolvedValue([]),
    reconcileDevices: vi.fn(),
    startEngine: vi.fn(),
    publishLayout: vi.fn().mockResolvedValue({ published: true }),
    BambuFtpsClient: MockBambuFtpsClient,
    parseThreemf: mockParseThreemf,
  };
});

const { mockJSZipLoadAsync } = vi.hoisted(() => ({ mockJSZipLoadAsync: vi.fn() }));
vi.mock("jszip", () => ({
  default: { loadAsync: mockJSZipLoadAsync },
}));

import { registerIpcHandlers } from "./ipc";
import { ipcMain, shell, dialog } from "electron";
import { fetchDevices, patchDeviceModel, loadCredentials, saveCredentials, reconcileDevices, startEngine, publishLayout, uploadLogs } from "@3pb/agent-core";
import { getEngine, setEngine, setBrokerPort, setBrokerPin, getReporters, setReporters, setUpdateAvailable, setCredentialStoreDegraded } from "./app-state";
import { stat, readFile, rm } from "node:fs/promises";

const TEST_BASE_URL = "http://test.example.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerIpcHandlers", () => {
  // ipc.ts sendiri manggil logger.error (Logger yang di-inject) di jalur kegagalan yang
  // dites di sini (engine gagal start, reporter gagal close) -- bukan console.error
  // langsung. Ini cuma nyampe console karena index.ts nge-alias `console` ke electron-log
  // saat runtime (lihat bootstrap()), yang tidak direplikasi test ini -- jadi di sini
  // logger.error tetap dites via spy pada `console.error` global. Tanpa dibungkam,
  // stack trace-nya nongol di stderr output turbo dan gampang disangka test failure
  // padahal testnya lulus.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vi.spyOn's return type
  // varies across vitest versions (MockInstance generic shape); avoid pinning to one here.
  let consoleErrorSpy: any;
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("daftarkan handler 'agent:activate'", () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:activate", expect.any(Function));
  });

  it("'agent:activate' panggil fetchDevices dengan token yang dioper", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    await handlers["agent:activate"]({}, "slz_test_token");
    expect(fetchDevices).toHaveBeenCalledWith(TEST_BASE_URL, "slz_test_token", expect.any(Object), expect.any(Object));
  });

  it("daftarkan handler 'agent:scan-lan'", () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    expect(ipcMain.handle).toHaveBeenCalledWith("agent:scan-lan", expect.any(Function));
  });

  it("'agent:forget-device' hapus secret device dari credential-store, sisa device lain tak tersentuh", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({
      agentToken: "slz_ok",
      devices: {
        abc1234567: { ip: "1.2.3.4", serial: "S1", accessCode: "1111" },
        def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" },
      },
    });

    await handlers["agent:forget-device"]({}, "abc1234567");

    expect(saveCredentials).toHaveBeenCalledWith(expect.anything(), {
      agentToken: "slz_ok",
      devices: { def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" } },
    });
  });

  it("'agent:get-snapshot' baca getEngine() TERKINI tiap dipanggil, bukan snapshot beku saat register", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    setEngine(null);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [] });

    const fakeEngine = { snapshot: () => ({ payload: [{ id: "x" }] }) } as any;
    setEngine(fakeEngine);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [{ id: "x" }] });

    setEngine(null);
  });

  it("'agent:get-broker-info' baca getBrokerPort() dan getBrokerPin() TERKINI tiap dipanggil", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    setBrokerPort(1883);
    setBrokerPin("0042");
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 1883, pin: "0042" });

    setBrokerPort(9999);
    setBrokerPin(null);
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 9999, pin: null });

    setBrokerPort(null);
    setBrokerPin(null);
  });
});

describe("agent:sync", () => {
  it("belum ada token -> {ok:false, kind:'invalid_token'}, TANPA panggil reconcileDevices", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "invalid_token" });
    expect(reconcileDevices).not.toHaveBeenCalled();
  });

  it("broker gak pernah jalan (getBrokerPort()===null) -> {ok:false, kind:'broker_unavailable'}, TANPA panggil reconcileDevices/startEngine (Minor #1)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    setBrokerPort(null);

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "broker_unavailable" });
    expect(reconcileDevices).not.toHaveBeenCalled();
    expect(startEngine).not.toHaveBeenCalled();
  });

  it("sukses: restart Engine dengan device terbaru, republish layout, balikin {ok:true, deviceCount}", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    const fakeReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: fakeEngine, reporters: [fakeReporter] });

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883, "0042", expect.any(Object));
    expect(publishLayout).toHaveBeenCalledWith(TEST_BASE_URL, "slz_ok", 1883, "default", "0042", expect.any(Object));
    expect(result).toEqual({ ok: true, deviceCount: 1 });
    expect(getEngine()).toBe(fakeEngine);
    expect(getReporters()).toEqual([fakeReporter]);

    setBrokerPort(null);
    setBrokerPin(null);
    setEngine(null);
    setReporters([]);
  });

  it("SaaS unreachable tapi ada device ter-pairing dari cache -> Engine TETAP direstart dari cache, tapi hasil tetap ok:false (distinguishable dari sukses)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: fakeEngine, reporters: [] });

    const result = await handlers["agent:sync"]();

    expect(startEngine).toHaveBeenCalledWith(paired, 1883, "0042", expect.any(Object));
    expect(result).toEqual({ ok: false, kind: "network_error" });

    setBrokerPort(null);
    setBrokerPin(null);
    setEngine(null);
    setReporters([]);
  });

  it("startEngine gagal (mis. accessCode salah) -> balikin {ok:false, kind:'engine_error'}, bukan reject/crash handler", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");
    (startEngine as any).mockRejectedValueOnce(new Error("boom"));

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "engine_error" });

    setBrokerPort(null);
    setBrokerPin(null);
    setEngine(null);
  });

  it("ganti Engine: Engine LAMA di-stop() SEBELUM Engine baru menggantikannya di app-state (Minor #2 -- urutan stop-before-restart belum ada test)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");

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
    setBrokerPin(null);
    setEngine(null);
  });

  it("ganti Engine: reporter LAMA (mis. MqttReporter) di-close() sebelum diganti reporter baru -- TANPA ini tiap Sync leak 1 koneksi MQTT (Important finding)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");

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
    setBrokerPin(null);
    setEngine(null);
    setReporters([]);
  });

  it("reporter lama gagal di-close() (mis. socket sudah putus) -> dicatat, TIDAK bikin seluruh Sync gagal", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    (reconcileDevices as any).mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    setBrokerPort(1883);
    setBrokerPin("0042");

    setEngine(null);
    setReporters([{ close: vi.fn().mockRejectedValue(new Error("socket sudah putus")) } as any]);
    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    (startEngine as any).mockResolvedValueOnce({ engine: newEngine, reporters: [] });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: true, deviceCount: 1 });

    setBrokerPort(null);
    setBrokerPin(null);
    setEngine(null);
    setReporters([]);
  });
});

describe("agent:get-activation-state", () => {
  it("belum ada token -> hasToken:false, devices:[], pairedShortCodes:[]", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    expect(await handlers["agent:get-activation-state"]()).toEqual({ hasToken: false, devices: [], pairedShortCodes: [] });
  });

  it("ada token -> hasToken:true, devices dari reconcileDevices, pairedShortCodes dari daftar paired", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
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
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
    expect(patchDeviceModel).not.toHaveBeenCalled();
  });

  it("ada token -> panggil patchDeviceModel dengan baseUrl+token+shortCode+model, balikin {ok:true} kalau sukses", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: true, data: { model: "P1S" } });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(patchDeviceModel).toHaveBeenCalledWith(TEST_BASE_URL, "slz_ok", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true });
  });

  it("patchDeviceModel gagal (mis. offline) -> {ok:false}, TIDAK throw", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: false, kind: "network_error" });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
  });

  it("patchDeviceModel gagal validasi (kind:invalid_model) -> {ok:false, kind:'invalid_model'} -- beda dari kegagalan network generik", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (patchDeviceModel as any).mockResolvedValueOnce({ ok: false, kind: "invalid_model" });

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "TerlaluPanjangUntukFirmware");

    expect(result).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("agent:printer-command", () => {
  it("engine belum jalan -> {ok:false, message:'engine_not_running'}", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    setEngine(null);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "pause" });
    expect(result).toEqual({ ok: false, message: "engine_not_running" });
  });

  it("delegasikan ke Engine.sendCommand dengan deviceId+cmd yang dioper apa adanya", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    setEngine({ snapshot: () => ({ payload: [] }), sendCommand } as any);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "setSpeedLevel", level: 3 });
    expect(sendCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 });
    expect(result).toEqual({ ok: true });
    setEngine(null);
  });
});

describe("agent:get-credential-store-status", () => {
  it("balikin degraded TERKINI dari app-state, bukan snapshot beku", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    setCredentialStoreDegraded(false);
    expect(await handlers["agent:get-credential-store-status"]()).toEqual({ degraded: false });
    setCredentialStoreDegraded(true);
    expect(await handlers["agent:get-credential-store-status"]()).toEqual({ degraded: true });
    setCredentialStoreDegraded(false);
  });
});

describe("agent:get-update-status", () => {
  it("balikin updateAvailable TERKINI dari app-state, bukan snapshot beku", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    setUpdateAvailable(false);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: false });
    setUpdateAvailable(true);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: true });
    setUpdateAvailable(false);
  });
});

describe("agent:open-download-page", () => {
  it("panggil shell.openExternal dengan ${saasBaseUrl}/settings", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).toHaveBeenCalledWith(`${TEST_BASE_URL}/settings`);
  });

  it("saasBaseUrl kosong (build salah konfigurasi) -> no-op, TIDAK panggil shell.openExternal dengan URL rusak", async () => {
    registerIpcHandlers({ saasBaseUrl: "" });
    (shell.openExternal as any).mockClear();
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe("agent:send-logs", () => {
  it("belum ada token -> {ok:false, reason:'no_token'}, TANPA baca file", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: null, devices: {} });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "no_token" });
    expect(stat).not.toHaveBeenCalled();
  });

  it("stat() gagal (file log tak ada) -> {ok:false, reason:'read_failed'}", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockRejectedValueOnce(new Error("ENOENT"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("file log > 5MB -> {ok:false, reason:'too_large'}, TANPA baca isi file / fetch", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 6 * 1024 * 1024 });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("readFile() gagal setelah stat() sukses -> {ok:false, reason:'read_failed'}", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockRejectedValueOnce(new Error("gagal baca"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("sukses: delegasi ke uploadLogs (agent-core) dengan isi file, balikin {ok:true}", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    (uploadLogs as any).mockResolvedValueOnce({ ok: true });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: true });
    expect(uploadLogs).toHaveBeenCalledWith(TEST_BASE_URL, "slz_ok", Buffer.from("log isi"), expect.any(Object));
  });

  it("upload gagal (uploadLogs balikin ok:false) -> hasil dioper apa adanya", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "slz_ok", devices: {} });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    (uploadLogs as any).mockResolvedValueOnce({ ok: false, reason: "upload_failed" });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "upload_failed" });
  });
});

describe("agent:file-list handler", () => {
  it("ambil kredensial device lalu list file via BambuFtpsClient", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({
      agentToken: "t",
      devices: { ABC123: { ip: "192.168.1.50", serial: "S1", accessCode: "999" } },
    });
    mockFileClient.list.mockResolvedValueOnce([
      { name: "a.gcode", path: "/a.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    const result = await handlers["agent:file-list"]({}, "ABC123", "/");

    expect(MockBambuFtpsClient).toHaveBeenCalledWith("192.168.1.50", "999");
    expect(mockFileClient.list).toHaveBeenCalledWith("/");
    expect(result).toEqual([
      { name: "a.gcode", path: "/a.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("balikin error terstruktur kalau device tidak ditemukan di credential store", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: {} });

    await expect(handlers["agent:file-list"]({}, "UNKNOWN", "/")).rejects.toThrow("device_not_found");
  });
});

describe("agent:file-upload / agent:file-download / agent:file-delete / agent:file-rename handlers", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("'agent:file-upload' ambil client device lalu panggil client.upload(localPath, remotePath)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });

    await handlers["agent:file-upload"]({}, "ABC123", "/local/a.gcode", "/a.gcode");

    expect(mockFileClient.upload).toHaveBeenCalledWith("/local/a.gcode", "/a.gcode");
  });

  it("'agent:file-download' ambil client device lalu panggil client.download(remotePath, localPath)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });

    await handlers["agent:file-download"]({}, "ABC123", "/a.gcode", "/local/a.gcode");

    expect(mockFileClient.download).toHaveBeenCalledWith("/a.gcode", "/local/a.gcode");
  });

  it("'agent:file-delete' ambil client device lalu panggil client.delete(remotePath)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });

    await handlers["agent:file-delete"]({}, "ABC123", "/a.gcode");

    expect(mockFileClient.delete).toHaveBeenCalledWith("/a.gcode");
  });

  it("'agent:file-rename' ambil client device lalu panggil client.rename(oldPath, newPath)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });

    await handlers["agent:file-rename"]({}, "ABC123", "/a.gcode", "/b.gcode");

    expect(mockFileClient.rename).toHaveBeenCalledWith("/a.gcode", "/b.gcode");
  });

  it("device tidak ditemukan -> semua handler reject device_not_found", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValue({ agentToken: "t", devices: {} });

    await expect(handlers["agent:file-upload"]({}, "UNKNOWN", "/local", "/remote")).rejects.toThrow(
      "device_not_found"
    );
    await expect(handlers["agent:file-download"]({}, "UNKNOWN", "/remote", "/local")).rejects.toThrow(
      "device_not_found"
    );
    await expect(handlers["agent:file-delete"]({}, "UNKNOWN", "/remote")).rejects.toThrow("device_not_found");
    await expect(handlers["agent:file-rename"]({}, "UNKNOWN", "/old", "/new")).rejects.toThrow("device_not_found");
  });
});

describe("agent:file-parse-3mf handler", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("download file ke temp, parse, lalu hapus file temp", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake"));
    mockParseThreemf.mockResolvedValueOnce([{ index: 1, filaments: [] }]);

    const result = await handlers["agent:file-parse-3mf"]({}, "ABC123", "/model.gcode.3mf");

    expect(mockFileClient.download).toHaveBeenCalledWith("/model.gcode.3mf", expect.stringContaining("model.gcode.3mf"));
    expect(mockParseThreemf).toHaveBeenCalledWith(Buffer.from("fake"));
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
    expect(result).toEqual([{ index: 1, filaments: [] }]);
  });

  it("parseThreemf gagal (bukan file 3mf Bambu valid) -> file temp tetap dihapus (cleanup lewat finally)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake"));
    mockParseThreemf.mockRejectedValueOnce(new Error("not_bambu_3mf"));

    await expect(handlers["agent:file-parse-3mf"]({}, "ABC123", "/model.gcode.3mf")).rejects.toThrow(
      "not_bambu_3mf"
    );

    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("device tidak ditemukan -> reject device_not_found, TANPA panggil download", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: {} });

    await expect(handlers["agent:file-parse-3mf"]({}, "UNKNOWN", "/model.gcode.3mf")).rejects.toThrow(
      "device_not_found"
    );
    expect(mockFileClient.download).not.toHaveBeenCalled();
  });
});

describe("agent:file-thumbnail handler", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("path bukan .gcode/.gcode.3mf -> balikin null TANPA download", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/readme.txt");

    expect(result).toBeNull();
    expect(mockFileClient.download).not.toHaveBeenCalled();
  });

  it("file .gcode polos: ekstrak thumbnail base64 dari header komentar gcode", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    const gcodeText = [
      "; generated by BambuStudio",
      "; thumbnail begin 300x300 1234",
      "; QUJD",
      "; RUZH",
      "; thumbnail end",
      "G28",
    ].join("\n");
    (readFile as any).mockResolvedValueOnce(gcodeText);

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode");

    expect(mockFileClient.download).toHaveBeenCalledWith("/model.gcode", expect.stringContaining("model.gcode"));
    expect(result).toBe("data:image/png;base64,QUJDRUZH");
  });

  it("file .gcode polos tanpa marker thumbnail -> balikin null (bukan crash)", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce("G28\nG1 X10\n");

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode");

    expect(result).toBeNull();
  });

  it("gcode.3mf tanpa plate_1.png tapi ada plate_1_small.png -> fallback ke situ", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    const mockSmallPng = { async: vi.fn().mockResolvedValue("U01BTEw=") };
    const files: Record<string, unknown> = { "Metadata/plate_1_small.png": mockSmallPng };
    mockJSZipLoadAsync.mockResolvedValueOnce({
      files,
      file: vi.fn((name: string) => (name === "Metadata/plate_1_small.png" ? mockSmallPng : null)),
    });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(result).toBe("data:image/png;base64,U01BTEw=");
  });

  it("gcode.3mf tanpa plate_1.png/plate_1_small.png -> fallback ke plate_N.png pertama", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    const mockPlate3 = { async: vi.fn().mockResolvedValue("UDM=") };
    const mockPlate11 = { async: vi.fn().mockResolvedValue("UDEx") };
    const files: Record<string, unknown> = {
      "Metadata/plate_11.png": mockPlate11,
      "Metadata/plate_3.png": mockPlate3,
    };
    mockJSZipLoadAsync.mockResolvedValueOnce({
      files,
      file: vi.fn((name: string) => (files[name] as { async: () => Promise<string> } | undefined) ?? null),
    });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    // plate_3 harus dipilih duluan (urut numerik: 3 < 11), bukan sort string ("11" < "3").
    expect(result).toBe("data:image/png;base64,UDM=");
  });

  it("download temp, ekstrak Metadata/plate_1.png dari zip, balikin data URL base64, lalu hapus temp", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    const mockPngFile = { async: vi.fn().mockResolvedValue("QUJD") };
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(mockPngFile) });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(mockFileClient.download).toHaveBeenCalledWith("/model.gcode.3mf", expect.stringContaining("model.gcode.3mf"));
    expect(result).toBe("data:image/png;base64,QUJD");
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("temp path pakai randomUUID (bukan cuma Date.now()) -- konsisten dengan pola agent:file-parse-3mf", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(null) });

    await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    const tempPathArg = mockFileClient.download.mock.calls[0][1] as string;
    expect(tempPathArg).toMatch(/agent-thumb-\d+-[0-9a-f-]{36}-model\.gcode\.3mf$/);
  });

  it("zip tidak punya Metadata/plate_1.png -> balikin null, temp tetap dihapus", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(null) });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(result).toBeNull();
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("download/parse gagal -> balikin null (bukan throw), temp tetap dihapus", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    (loadCredentials as any).mockResolvedValueOnce({ agentToken: "t", devices: { ABC123: secret } });
    mockFileClient.download.mockRejectedValueOnce(new Error("connection refused"));

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(result).toBeNull();
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });
});

describe("agent:pick-download-folder handler", () => {
  it("user pilih folder -> balikin filePaths[0]", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["/home/user/Downloads"] });

    const result = await handlers["agent:pick-download-folder"]();

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ["openDirectory"] });
    expect(result).toBe("/home/user/Downloads");
  });

  it("user batal dialog -> balikin null", async () => {
    registerIpcHandlers({ saasBaseUrl: TEST_BASE_URL });
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    const result = await handlers["agent:pick-download-folder"]();

    expect(result).toBeNull();
  });
});
