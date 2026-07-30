import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchDevices, fetchLayout, patchDeviceModel, saasBaseUrl } from "./saas-client";

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
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid" }, signal: expect.any(AbortSignal) })
    );
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
});
