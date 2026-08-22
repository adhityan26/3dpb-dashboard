import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchDevices, fetchLayout, patchDeviceModel, fetchLatestVersion, saasBaseUrl } from "./saas-client";

vi.mock("electron-log/main", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
  process.env.SAAS_BASE_URL = "http://192.168.88.113:3300";
});

describe("saasBaseUrl", () => {
  const original = process.env.SAAS_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.SAAS_BASE_URL;
    else process.env.SAAS_BASE_URL = original;
  });

  it("env var runtime menang kalau diisi", () => {
    process.env.SAAS_BASE_URL = "http://127.0.0.1:9999";
    expect(saasBaseUrl()).toBe("http://127.0.0.1:9999");
  });

  it("env var kosong -> jatuh ke konstanta build-time (di test = string kosong, di build = define electron.vite.config.ts)", () => {
    delete process.env.SAAS_BASE_URL;
    // Di lingkungan test `__SAAS_BASE_URL__` memang tak ada (tak ada define), jadi hasilnya
    // "" — persis kondisi yang bikin bootstrap() menulis warning eksplisit. Yang dijamin
    // test ini: pembacaan build-time constant tidak melempar ReferenceError.
    expect(saasBaseUrl()).toBe("");
    process.env.SAAS_BASE_URL = "";
    expect(saasBaseUrl()).toBe("");
  });
});

describe("fetchDevices", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    const result = await fetchDevices("slz_valid");
    expect(result).toEqual({ ok: true, data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid", "X-Agent-Version": "0.0.0+nogit" }, signal: expect.any(AbortSignal) })
    );
  });

  it("kirim header X-Agent-Version = versi+commit hash (gaya semver build-metadata) -- server catat build persis yang lagi konek (diagnosa komplain user, bedain build staging satu ke lain tanpa naikkan versi)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchDevices("slz_valid");
    const [, options] = fetchMock.mock.calls[0];
    // "0.0.0+nogit" di test = __AGENT_VERSION__/__AGENT_COMMIT_HASH__ tak ter-define (cuma
    // di-inject saat build sungguhan via electron.vite.config.ts, sama pola dgn
    // __SAAS_BASE_URL__/saasBaseUrl di atas).
    expect(options.headers["X-Agent-Version"]).toBe("0.0.0+nogit");
  });

  it("pakai AbortSignal buat timeout — cegah TCP connect hang (captive portal/DNS blackhole)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchDevices("slz_valid");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchDevices("slz_bad")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchDevices("slz_valid")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw (SaaS unreachable)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchDevices("slz_valid")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:wrong_server (BUKAN network_error) kalau 200 tapi body HTML -- SAAS_BASE_URL build menunjuk ke server yang bukan app Slizebiz", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    expect(await fetchDevices("slz_valid")).toEqual({ ok: false, kind: "wrong_server" });
  });

  it("content-type JSON dengan charset tetap dianggap JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json; charset=utf-8" }), json: async () => [] });
    expect(await fetchDevices("slz_valid")).toEqual({ ok: true, data: [] });
  });
});

describe("fetchLayout", () => {
  it("ok:true + data:null kalau 404 (belum diatur, BUKAN error)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "no_layout" }) });
    expect(await fetchLayout("slz_valid")).toEqual({ ok: true, data: null });
  });

  it("ok:true + data layout kalau 200", async () => {
    const layout = { schemaVersion: 1, pages: [] };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => layout });
    expect(await fetchLayout("slz_valid")).toEqual({ ok: true, data: layout });
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLayout("slz_bad")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:wrong_server kalau 200 tapi body HTML -- jangan diam-diam gagal publish layout sebagai network_error", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    expect(await fetchLayout("slz_valid")).toEqual({ ok: false, kind: "wrong_server" });
  });
});

describe("patchDeviceModel", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ model: "P1S" }) });
    const result = await patchDeviceModel("slz_valid", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true, data: { model: "P1S" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/devices/abc1234567",
      expect.objectContaining({
        method: "PATCH",
        headers: { Authorization: "Bearer slz_valid", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "P1S" }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await patchDeviceModel("slz_bad", "abc1234567", "P1S")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await patchDeviceModel("slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await patchDeviceModel("slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:network_error kalau 404 (shortCode tak dikenal SaaS ini)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) });
    expect(await patchDeviceModel("slz_valid", "abc-lain", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:invalid_model kalau 400 { error: 'invalid_device_model' } -- beda dari network_error, model-nya yang ditolak", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_device_model" }) });
    expect(await patchDeviceModel("slz_valid", "abc1234567", "TerlaluPanjangUntukFirmware")).toEqual({ ok: false, kind: "invalid_model" });
  });

  it("kind:network_error kalau 400 dengan body error lain (bukan invalid_device_model)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "something_else" }) });
    expect(await patchDeviceModel("slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });
});

describe("fetchLatestVersion", () => {
  it("commitHash beda dari AGENT_COMMIT_HASH build ini ('nogit' di test) -> updateAvailable:true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "a3f9c21" }) });
    const result = await fetchLatestVersion("slz_valid", "win");
    expect(result).toEqual({ ok: true, data: { updateAvailable: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/version?platform=win",
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid", "X-Agent-Version": "0.0.0+nogit" }, signal: expect.any(AbortSignal) })
    );
  });

  it("commitHash SAMA dengan AGENT_COMMIT_HASH build ini -> updateAvailable:false", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "nogit" }) });
    const result = await fetchLatestVersion("slz_valid", "win");
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
  });

  it("commitHash:null (belum pernah admin upload) -> updateAvailable:false, JANGAN pernah 'update available' palsu", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: null }) });
    const result = await fetchLatestVersion("slz_valid", "mac");
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.88.113:3300/api/agent/version?platform=mac",
      expect.anything()
    );
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLatestVersion("slz_bad", "win")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchLatestVersion("slz_valid", "win")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchLatestVersion("slz_valid", "win")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:wrong_server kalau 200 tapi body HTML", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    expect(await fetchLatestVersion("slz_valid", "win")).toEqual({ ok: false, kind: "wrong_server" });
  });
});
