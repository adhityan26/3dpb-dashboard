import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRuntime, InMemoryCredentialStore, type CredentialBlob } from "@3pb/agent-core";

// ---------------------------------------------------------------------------------------
// Mock strategy (rewritten for Task 11, updated after the getRuntime() facade was removed):
// ipc.ts no longer imports any individual @3pb/agent-core function, and `registerIpcHandlers`
// no longer calls a `getRuntime()` facade either -- it takes a `runtime: AgentRuntime`
// directly as a parameter and delegates every handler to a method on AgentService built
// from it. Mocking @3pb/agent-core's named exports (the OLD strategy) therefore no longer
// intercepts anything ipc.ts calls directly.
//
// Instead we construct a REAL AgentRuntime (backed by InMemoryCredentialStore), pass it
// straight into registerIpcHandlers(runtime), and mock
// only the true I/O boundaries AgentService's internals reach:
// - global `fetch` -- saas-client.ts (fetchDevices/patchDeviceModel/uploadLogs/fetchLayout)
//   is plain fetch(), so mocking fetch exercises AgentService's real HTTP-call construction
//   instead of asserting a mocked function was "called with" the right args.
// - node:fs/promises + jszip -- true I/O for send-logs / file-parse-3mf / file-thumbnail.
// - the underlying agent-core SOURCE FILES for reconcileDevices/startEngine/publishLayout/
//   scanBambu/scanMoonraker/BambuFtpsClient/parseThreemf -- these touch real UDP sockets,
//   mDNS, MQTT brokers, and FTPS servers that cannot run in a unit test. We mock them at
//   their real file path (resolved the same way agent-service.ts resolves "./startup" etc.
//   via the pnpm workspace symlink) rather than at the "@3pb/agent-core" barrel, since the
//   barrel is a distinct module identity that agent-service.ts's relative imports never
//   pass through -- mocking the barrel from here would not intercept anything.
// This is the same "mock the true I/O boundary, not our own code" idiom already
// established by packages/agent-core/src/agent-service.test.ts (Tasks 8-10).
// ---------------------------------------------------------------------------------------

const { mockShowOpenDialog } = vi.hoisted(() => ({ mockShowOpenDialog: vi.fn() }));
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: mockShowOpenDialog },
}));

// Vitest's Node built-in module interop requires a "default" export alongside the named
// ones -- without it, importing this mock throws at module-load time before any test runs.
vi.mock("node:fs/promises", () => {
  const stat = vi.fn();
  const readFile = vi.fn();
  const rm = vi.fn().mockResolvedValue(undefined);
  return { stat, readFile, rm, default: { stat, readFile, rm } };
});

const { mockJSZipLoadAsync } = vi.hoisted(() => ({ mockJSZipLoadAsync: vi.fn() }));
vi.mock("jszip", () => ({
  default: { loadAsync: mockJSZipLoadAsync },
}));

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
vi.mock("../../../../packages/agent-core/src/file-manager/bambu-ftps-client", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/file-manager/bambu-ftps-client")>(
    "../../../../packages/agent-core/src/file-manager/bambu-ftps-client",
  );
  return { ...actual, BambuFtpsClient: MockBambuFtpsClient };
});

const { mockParseThreemf } = vi.hoisted(() => ({ mockParseThreemf: vi.fn() }));
vi.mock("../../../../packages/agent-core/src/file-manager/threemf-parser", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/file-manager/threemf-parser")>(
    "../../../../packages/agent-core/src/file-manager/threemf-parser",
  );
  return { ...actual, parseThreemf: mockParseThreemf };
});

const { mockReconcileDevices } = vi.hoisted(() => ({ mockReconcileDevices: vi.fn() }));
vi.mock("../../../../packages/agent-core/src/startup", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/startup")>(
    "../../../../packages/agent-core/src/startup",
  );
  return { ...actual, reconcileDevices: mockReconcileDevices };
});

const { mockStartEngine } = vi.hoisted(() => ({ mockStartEngine: vi.fn() }));
vi.mock("../../../../packages/agent-core/src/engine-manager", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/engine-manager")>(
    "../../../../packages/agent-core/src/engine-manager",
  );
  return { ...actual, startEngine: mockStartEngine };
});

const { mockPublishLayout } = vi.hoisted(() => ({ mockPublishLayout: vi.fn() }));
vi.mock("../../../../packages/agent-core/src/layout-publisher", async () => {
  const actual = await vi.importActual<typeof import("../../../../packages/agent-core/src/layout-publisher")>(
    "../../../../packages/agent-core/src/layout-publisher",
  );
  return { ...actual, publishLayout: mockPublishLayout };
});

import { registerIpcHandlers } from "./ipc";
import { ipcMain, shell, dialog } from "electron";
import { stat, readFile, rm } from "node:fs/promises";

const TEST_BASE_URL = "http://test.example.com";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  // Default no-op success so tests that don't care about publishLayout (most agent:sync
  // cases) don't need to stub it individually -- mirrors the old header mock's
  // `publishLayout: vi.fn().mockResolvedValue({ published: true })` default.
  mockPublishLayout.mockResolvedValue({ published: true });
});

function jsonResponse(status: number, body: unknown, contentType = "application/json"): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => body,
  } as unknown as Response;
}

function setupHandlers(
  options: { seed?: CredentialBlob | null; baseUrl?: string; logFilePath?: string | null } = {},
) {
  const { seed = null, baseUrl = TEST_BASE_URL, logFilePath = null } = options;
  const store = new InMemoryCredentialStore(seed);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = new AgentRuntime({
    credentialStore: store,
    pathProvider: { userDataDir: () => "/fake" },
    logger,
    logFileProvider: { getLogFilePath: () => logFilePath },
    buildInfo: { version: "0.0.1", commitHash: "abc1234" },
    saasBaseUrl: baseUrl,
    updatePlatform: "win",
  });
  registerIpcHandlers(runtime);

  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  for (const call of vi.mocked(ipcMain.handle).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown;
  }
  return { handlers, runtime, store, logger };
}

describe("registerIpcHandlers", () => {
  it("daftarkan handler 'agent:activate'", () => {
    const { handlers } = setupHandlers();
    expect(handlers["agent:activate"]).toBeTypeOf("function");
  });

  it("'agent:activate' panggil fetchDevices (via fetch) dengan Authorization Bearer token yang dioper", async () => {
    const { handlers } = setupHandlers();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));

    await handlers["agent:activate"]({}, "slz_test_token");

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/agent/devices`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer slz_test_token" }),
      }),
    );
  });

  it("daftarkan handler 'agent:scan-lan'", () => {
    const { handlers } = setupHandlers();
    expect(handlers["agent:scan-lan"]).toBeTypeOf("function");
  });

  it("'agent:forget-device' hapus secret device dari credential-store, sisa device lain tak tersentuh", async () => {
    const { handlers, store } = setupHandlers({
      seed: {
        agentToken: "slz_ok",
        devices: {
          abc1234567: { ip: "1.2.3.4", serial: "S1", accessCode: "1111" },
          def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" },
        },
      },
    });

    await handlers["agent:forget-device"]({}, "abc1234567");

    expect(await store.load()).toEqual({
      status: "ok",
      blob: {
        agentToken: "slz_ok",
        devices: { def1234567: { ip: "5.6.7.8", serial: "S2", accessCode: "2222" } },
      },
    });
  });

  // NOTE: tautologis di desain baru -- AgentService.getSnapshot() SELALU baca
  // runtime.getEngine() live (bukan snapshot beku), jadi tes ini tak lagi membuktikan
  // sesuatu yang bisa gagal secara berarti. Diporting apa adanya per instruksi task.
  it("'agent:get-snapshot' baca getEngine() TERKINI tiap dipanggil, bukan snapshot beku saat register", async () => {
    const { handlers, runtime } = setupHandlers();
    runtime.setEngine(null);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [] });

    const fakeEngine = { snapshot: () => ({ payload: [{ id: "x" }] }) } as any;
    runtime.setEngine(fakeEngine);
    expect(await handlers["agent:get-snapshot"]()).toEqual({ payload: [{ id: "x" }] });
  });

  // NOTE: sama seperti di atas -- tautologis di desain baru.
  it("'agent:get-broker-info' baca getBrokerPort() dan getBrokerPin() TERKINI tiap dipanggil", async () => {
    const { handlers, runtime } = setupHandlers();
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 1883, pin: "0042" });

    runtime.setBrokerPort(9999);
    runtime.setBrokerPin(null);
    expect(await handlers["agent:get-broker-info"]()).toEqual({ ip: expect.any(String), port: 9999, pin: null });
  });
});

describe("agent:sync", () => {
  it("belum ada token -> {ok:false, kind:'invalid_token'}, TANPA panggil reconcileDevices", async () => {
    const { handlers } = setupHandlers();

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "invalid_token" });
    expect(mockReconcileDevices).not.toHaveBeenCalled();
  });

  it("broker gak pernah jalan (getBrokerPort()===null) -> {ok:false, kind:'broker_unavailable'}, TANPA panggil reconcileDevices/startEngine (Minor #1)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "broker_unavailable" });
    expect(mockReconcileDevices).not.toHaveBeenCalled();
    expect(mockStartEngine).not.toHaveBeenCalled();
  });

  it("sukses: restart Engine dengan device terbaru, republish layout, balikin {ok:true, deviceCount}", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    const fakeReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    mockStartEngine.mockResolvedValueOnce({ engine: fakeEngine, reporters: [fakeReporter] });
    mockPublishLayout.mockResolvedValueOnce({ published: true });

    const result = await handlers["agent:sync"]();

    expect(mockStartEngine).toHaveBeenCalledWith(paired, 1883, "0042", expect.any(Object));
    expect(mockPublishLayout).toHaveBeenCalledWith(TEST_BASE_URL, "slz_ok", 1883, "default", "0042", expect.any(Object));
    expect(result).toEqual({ ok: true, deviceCount: 1 });
    expect(runtime.getEngine()).toBe(fakeEngine);
    expect(runtime.getReporters()).toEqual([fakeReporter]);
  });

  it("SaaS unreachable tapi ada device ter-pairing dari cache -> Engine TETAP direstart dari cache, tapi hasil tetap ok:false (distinguishable dari sukses)", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A (cache)", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: false, kind: "network_error" }, devices: [], paired });
    const fakeEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    mockStartEngine.mockResolvedValueOnce({ engine: fakeEngine, reporters: [] });
    mockPublishLayout.mockResolvedValueOnce({ published: false });

    const result = await handlers["agent:sync"]();

    expect(mockStartEngine).toHaveBeenCalledWith(paired, 1883, "0042", expect.any(Object));
    expect(result).toEqual({ ok: false, kind: "network_error" });
  });

  it("startEngine gagal (mis. accessCode salah) -> balikin {ok:false, kind:'engine_error'}, bukan reject/crash handler", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });
    mockStartEngine.mockRejectedValueOnce(new Error("boom"));

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: false, kind: "engine_error" });
  });

  it("ganti Engine: Engine LAMA di-stop() SEBELUM Engine baru menggantikannya di app-state (Minor #2 -- urutan stop-before-restart belum ada test)", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });

    const callOrder: string[] = [];
    const oldEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn().mockImplementation(async () => { callOrder.push("old-engine-stopped"); }) } as any;
    runtime.setEngine(oldEngine);
    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    mockStartEngine.mockImplementationOnce(async () => {
      callOrder.push("new-engine-started");
      return { engine: newEngine, reporters: [] };
    });

    await handlers["agent:sync"]();

    expect(oldEngine.stop).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["old-engine-stopped", "new-engine-started"]);
    expect(runtime.getEngine()).toBe(newEngine); // Engine lama BENAR-BENAR diganti, bukan cuma di-stop lalu dibiarkan
  });

  it("ganti Engine: reporter LAMA (mis. MqttReporter) di-close() sebelum diganti reporter baru -- TANPA ini tiap Sync leak 1 koneksi MQTT (Important finding)", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });

    const oldEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn().mockResolvedValue(undefined) } as any;
    const oldReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    runtime.setEngine(oldEngine);
    runtime.setReporters([oldReporter]);

    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    const newReporter = { close: vi.fn().mockResolvedValue(undefined) } as any;
    mockStartEngine.mockResolvedValueOnce({ engine: newEngine, reporters: [newReporter] });

    await handlers["agent:sync"]();

    // Reporter LAMA harus ke-close() -- ini yang mencegah leak koneksi MQTT (bug utama yang
    // ditemukan review): tanpa baris ini, tiap klik Sync bikin 1 koneksi baru yang gak pernah
    // ditutup. Logikanya sekarang ada di AgentRuntime.teardownEngine(), bukan lagi di ipc.ts.
    expect(oldReporter.close).toHaveBeenCalledTimes(1);
    // Reporter yang dilacak runtime sekarang HARUS reporter yang baru, bukan lama ataupun
    // gabungan keduanya.
    expect(runtime.getReporters()).toEqual([newReporter]);
  });

  it("reporter lama gagal di-close() (mis. socket sudah putus) -> dicatat, TIDAK bikin seluruh Sync gagal", async () => {
    const { handlers, runtime } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    runtime.setBrokerPort(1883);
    runtime.setBrokerPin("0042");
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: [] }, devices: [], paired });

    runtime.setEngine(null);
    runtime.setReporters([{ close: vi.fn().mockRejectedValue(new Error("socket sudah putus")) } as any]);
    const newEngine = { snapshot: () => ({ payload: [] }), stop: vi.fn() } as any;
    mockStartEngine.mockResolvedValueOnce({ engine: newEngine, reporters: [] });

    const result = await handlers["agent:sync"]();

    expect(result).toEqual({ ok: true, deviceCount: 1 });
  });
});

describe("agent:get-activation-state", () => {
  it("belum ada token -> hasToken:false, devices:[], pairedShortCodes:[]", async () => {
    const { handlers } = setupHandlers();

    expect(await handlers["agent:get-activation-state"]()).toEqual({ hasToken: false, devices: [], pairedShortCodes: [] });
  });

  it("ada token -> hasToken:true, devices dari reconcileDevices, pairedShortCodes dari daftar paired", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];
    const paired = [{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", secret: { ip: "1.2.3.4", serial: "S1", accessCode: "1234" } }];
    mockReconcileDevices.mockResolvedValueOnce({ fetchResult: { ok: true, data: devices }, devices, paired });

    expect(await handlers["agent:get-activation-state"]()).toEqual({
      hasToken: true,
      devices,
      pairedShortCodes: ["abc1234567"],
    });
  });
});

describe("agent:update-device-model", () => {
  it("belum ada token -> {ok:false}, TANPA panggil patchDeviceModel (fetch)", async () => {
    const { handlers } = setupHandlers();

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ada token -> panggil patchDeviceModel (PATCH via fetch) dengan baseUrl+token+shortCode+model, balikin {ok:true} kalau sukses", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { model: "P1S" }));

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/agent/devices/abc1234567`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer slz_ok" }),
        body: JSON.stringify({ model: "P1S" }),
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("patchDeviceModel gagal (mis. offline) -> {ok:false}, TIDAK throw", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    fetchMock.mockResolvedValueOnce(jsonResponse(500, null));

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "P1S");

    expect(result).toEqual({ ok: false });
  });

  it("patchDeviceModel gagal validasi (kind:invalid_model) -> {ok:false, kind:'invalid_model'} -- beda dari kegagalan network generik", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} } });
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "invalid_device_model" }));

    const result = await handlers["agent:update-device-model"]({}, "abc1234567", "TerlaluPanjangUntukFirmware");

    expect(result).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("agent:printer-command", () => {
  it("engine belum jalan -> {ok:false, message:'engine_not_running'}", async () => {
    const { handlers, runtime } = setupHandlers();
    runtime.setEngine(null);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "pause" });
    expect(result).toEqual({ ok: false, message: "engine_not_running" });
  });

  it("delegasikan ke Engine.sendCommand dengan deviceId+cmd yang dioper apa adanya", async () => {
    const { handlers, runtime } = setupHandlers();
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    runtime.setEngine({ snapshot: () => ({ payload: [] }), sendCommand } as any);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "setSpeedLevel", level: 3 });
    expect(sendCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 });
    expect(result).toEqual({ ok: true });
  });
});

// NOTE: tautologis di desain baru -- AgentService.getCredentialStoreStatus() SELALU baca
// runtime.getCredentialStoreDegraded() live. Diporting apa adanya.
describe("agent:get-credential-store-status", () => {
  it("balikin degraded TERKINI dari app-state, bukan snapshot beku", async () => {
    const { handlers, runtime } = setupHandlers();
    runtime.setCredentialStoreDegraded(false);
    expect(await handlers["agent:get-credential-store-status"]()).toEqual({ degraded: false });
    runtime.setCredentialStoreDegraded(true);
    expect(await handlers["agent:get-credential-store-status"]()).toEqual({ degraded: true });
  });
});

// NOTE: tautologis di desain baru -- AgentService.getUpdateStatus() SELALU baca
// runtime.getUpdateAvailable() live. Diporting apa adanya.
describe("agent:get-update-status", () => {
  it("balikin updateAvailable TERKINI dari app-state, bukan snapshot beku", async () => {
    const { handlers, runtime } = setupHandlers();
    runtime.setUpdateAvailable(false);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: false });
    runtime.setUpdateAvailable(true);
    expect(await handlers["agent:get-update-status"]()).toEqual({ updateAvailable: true });
  });
});

describe("agent:open-download-page", () => {
  it("panggil shell.openExternal dengan ${saasBaseUrl}/settings", async () => {
    const { handlers } = setupHandlers();
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).toHaveBeenCalledWith(`${TEST_BASE_URL}/settings`);
  });

  it("saasBaseUrl kosong (build salah konfigurasi) -> no-op, TIDAK panggil shell.openExternal dengan URL rusak", async () => {
    const { handlers } = setupHandlers({ baseUrl: "" });
    await handlers["agent:open-download-page"]();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe("agent:send-logs", () => {
  it("belum ada token -> {ok:false, reason:'no_token'}, TANPA baca file", async () => {
    const { handlers } = setupHandlers();

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "no_token" });
    expect(stat).not.toHaveBeenCalled();
  });

  it("stat() gagal (file log tak ada) -> {ok:false, reason:'read_failed'}", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} }, logFilePath: "/tmp/agent.log" });
    (stat as any).mockRejectedValueOnce(new Error("ENOENT"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("file log > 5MB -> {ok:false, reason:'too_large'}, TANPA baca isi file / fetch", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} }, logFilePath: "/tmp/agent.log" });
    (stat as any).mockResolvedValueOnce({ size: 6 * 1024 * 1024 });

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("readFile() gagal setelah stat() sukses -> {ok:false, reason:'read_failed'}", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} }, logFilePath: "/tmp/agent.log" });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockRejectedValueOnce(new Error("gagal baca"));

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "read_failed" });
  });

  it("sukses: delegasi ke uploadLogs (via fetch POST) dengan isi file, balikin {ok:true}", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} }, logFilePath: "/tmp/agent.log" });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response);

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/agent/logs`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer slz_ok" }),
        body: Buffer.from("log isi"),
      }),
    );
  });

  it("upload gagal (fetch res.ok:false) -> hasil dioper apa adanya", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "slz_ok", devices: {} }, logFilePath: "/tmp/agent.log" });
    (stat as any).mockResolvedValueOnce({ size: 100 });
    (readFile as any).mockResolvedValueOnce(Buffer.from("log isi"));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);

    const result = await handlers["agent:send-logs"]();

    expect(result).toEqual({ ok: false, reason: "upload_failed" });
  });
});

describe("agent:file-list handler", () => {
  it("ambil kredensial device lalu list file via BambuFtpsClient", async () => {
    const { handlers } = setupHandlers({
      seed: { agentToken: "t", devices: { ABC123: { ip: "192.168.1.50", serial: "S1", accessCode: "999" } } },
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
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: {} } });

    await expect(handlers["agent:file-list"]({}, "UNKNOWN", "/")).rejects.toThrow("device_not_found");
  });
});

describe("agent:file-upload / agent:file-download / agent:file-delete / agent:file-rename handlers", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("'agent:file-upload' ambil client device lalu panggil client.upload(localPath, remotePath)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });

    await handlers["agent:file-upload"]({}, "ABC123", "/local/a.gcode", "/a.gcode");

    expect(mockFileClient.upload).toHaveBeenCalledWith("/local/a.gcode", "/a.gcode");
  });

  it("'agent:file-download' ambil client device lalu panggil client.download(remotePath, localPath)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });

    await handlers["agent:file-download"]({}, "ABC123", "/a.gcode", "/local/a.gcode");

    expect(mockFileClient.download).toHaveBeenCalledWith("/a.gcode", "/local/a.gcode");
  });

  it("'agent:file-delete' ambil client device lalu panggil client.delete(remotePath)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });

    await handlers["agent:file-delete"]({}, "ABC123", "/a.gcode");

    expect(mockFileClient.delete).toHaveBeenCalledWith("/a.gcode");
  });

  it("'agent:file-rename' ambil client device lalu panggil client.rename(oldPath, newPath)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });

    await handlers["agent:file-rename"]({}, "ABC123", "/a.gcode", "/b.gcode");

    expect(mockFileClient.rename).toHaveBeenCalledWith("/a.gcode", "/b.gcode");
  });

  it("device tidak ditemukan -> semua handler reject device_not_found", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: {} } });

    await expect(handlers["agent:file-upload"]({}, "UNKNOWN", "/local", "/remote")).rejects.toThrow(
      "device_not_found",
    );
    await expect(handlers["agent:file-download"]({}, "UNKNOWN", "/remote", "/local")).rejects.toThrow(
      "device_not_found",
    );
    await expect(handlers["agent:file-delete"]({}, "UNKNOWN", "/remote")).rejects.toThrow("device_not_found");
    await expect(handlers["agent:file-rename"]({}, "UNKNOWN", "/old", "/new")).rejects.toThrow("device_not_found");
  });
});

describe("agent:file-parse-3mf handler", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("download file ke temp, parse, lalu hapus file temp", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake"));
    mockParseThreemf.mockResolvedValueOnce([{ index: 1, filaments: [] }]);

    const result = await handlers["agent:file-parse-3mf"]({}, "ABC123", "/model.gcode.3mf");

    expect(mockFileClient.download).toHaveBeenCalledWith("/model.gcode.3mf", expect.stringContaining("model.gcode.3mf"));
    expect(mockParseThreemf).toHaveBeenCalledWith(Buffer.from("fake"));
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
    expect(result).toEqual([{ index: 1, filaments: [] }]);
  });

  it("parseThreemf gagal (bukan file 3mf Bambu valid) -> file temp tetap dihapus (cleanup lewat finally)", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake"));
    mockParseThreemf.mockRejectedValueOnce(new Error("not_bambu_3mf"));

    await expect(handlers["agent:file-parse-3mf"]({}, "ABC123", "/model.gcode.3mf")).rejects.toThrow(
      "not_bambu_3mf",
    );

    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("device tidak ditemukan -> reject device_not_found, TANPA panggil download", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: {} } });

    await expect(handlers["agent:file-parse-3mf"]({}, "UNKNOWN", "/model.gcode.3mf")).rejects.toThrow(
      "device_not_found",
    );
    expect(mockFileClient.download).not.toHaveBeenCalled();
  });
});

describe("agent:file-thumbnail handler", () => {
  const secret = { ip: "192.168.1.50", serial: "S1", accessCode: "999" };

  it("path bukan .gcode/.gcode.3mf -> balikin null TANPA download", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/readme.txt");

    expect(result).toBeNull();
    expect(mockFileClient.download).not.toHaveBeenCalled();
  });

  it("file .gcode polos: ekstrak thumbnail base64 dari header komentar gcode", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
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
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce("G28\nG1 X10\n");

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode");

    expect(result).toBeNull();
  });

  it("gcode.3mf tanpa plate_1.png tapi ada plate_1_small.png -> fallback ke situ", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
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
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
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
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    const mockPngFile = { async: vi.fn().mockResolvedValue("QUJD") };
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(mockPngFile) });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(mockFileClient.download).toHaveBeenCalledWith("/model.gcode.3mf", expect.stringContaining("model.gcode.3mf"));
    expect(result).toBe("data:image/png;base64,QUJD");
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("temp path pakai randomUUID (bukan cuma Date.now()) -- konsisten dengan pola agent:file-parse-3mf", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(null) });

    await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    const tempPathArg = mockFileClient.download.mock.calls[0][1] as string;
    expect(tempPathArg).toMatch(/agent-thumb-\d+-[0-9a-f-]{36}-model\.gcode\.3mf$/);
  });

  it("zip tidak punya Metadata/plate_1.png -> balikin null, temp tetap dihapus", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    (readFile as any).mockResolvedValueOnce(Buffer.from("fake-zip"));
    mockJSZipLoadAsync.mockResolvedValueOnce({ file: vi.fn().mockReturnValue(null) });

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(result).toBeNull();
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });

  it("download/parse gagal -> balikin null (bukan throw), temp tetap dihapus", async () => {
    const { handlers } = setupHandlers({ seed: { agentToken: "t", devices: { ABC123: secret } } });
    mockFileClient.download.mockRejectedValueOnce(new Error("connection refused"));

    const result = await handlers["agent:file-thumbnail"]({}, "ABC123", "/model.gcode.3mf");

    expect(result).toBeNull();
    expect(rm).toHaveBeenCalledWith(expect.stringContaining("model.gcode.3mf"), { force: true });
  });
});

describe("agent:pick-download-folder handler", () => {
  it("user pilih folder -> balikin filePaths[0]", async () => {
    const { handlers } = setupHandlers();
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["/home/user/Downloads"] });

    const result = await handlers["agent:pick-download-folder"]();

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ["openDirectory"] });
    expect(result).toBe("/home/user/Downloads");
  });

  it("user batal dialog -> balikin null", async () => {
    const { handlers } = setupHandlers();
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    const result = await handlers["agent:pick-download-folder"]();

    expect(result).toBeNull();
  });
});
