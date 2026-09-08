import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDevices, fetchLayout, patchDeviceModel, fetchLatestVersion, uploadLogs } from "./saas-client";
import type { Logger, BuildInfo } from "./interfaces";

const BASE_URL = "http://192.168.88.113:3300";
const BUILD_INFO: BuildInfo = { version: "0.0.0", commitHash: "nogit" };

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("fetchDevices", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }],
    });
    const result = await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "A", printerType: "bambu", createdAt: "x", updatedAt: "y" }] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/agent/devices`,
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid", "X-Agent-Version": "0.0.0+nogit" }, signal: expect.any(AbortSignal) })
    );
  });

  it("kirim header X-Agent-Version = versi+commit hash (gaya semver build-metadata) -- server catat build persis yang lagi konek (diagnosa komplain user, bedain build staging satu ke lain tanpa naikkan versi)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger());
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["X-Agent-Version"]).toBe("0.0.0+nogit");
  });

  it("pakai AbortSignal buat timeout — cegah TCP connect hang (captive portal/DNS blackhole)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger());
    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchDevices(BASE_URL, "slz_bad", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw (SaaS unreachable)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:wrong_server (BUKAN network_error) kalau 200 tapi body HTML -- baseUrl menunjuk ke server yang bukan app Slizebiz", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    const logger = makeLogger();
    expect(await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, logger)).toEqual({ ok: false, kind: "wrong_server" });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("content-type JSON dengan charset tetap dianggap JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json; charset=utf-8" }), json: async () => [] });
    expect(await fetchDevices(BASE_URL, "slz_valid", BUILD_INFO, makeLogger())).toEqual({ ok: true, data: [] });
  });

  it("200 tapi content-type bukan JSON (dari brief) -> wrong_server, logger.error dipanggil", async () => {
    const logger = makeLogger();
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "text/html" } });
    expect(await fetchDevices(BASE_URL, "t", BUILD_INFO, logger)).toEqual({ ok: false, kind: "wrong_server" });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("fetchLayout", () => {
  it("ok:true + data:null kalau 404 (belum diatur, BUKAN error)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "no_layout" }) });
    expect(await fetchLayout(BASE_URL, "slz_valid")).toEqual({ ok: true, data: null });
  });

  it("ok:true + data layout kalau 200", async () => {
    const layout = { schemaVersion: 1, pages: [] };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => layout });
    expect(await fetchLayout(BASE_URL, "slz_valid")).toEqual({ ok: true, data: layout });
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLayout(BASE_URL, "slz_bad")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:wrong_server kalau 200 tapi body HTML -- jangan diam-diam gagal publish layout sebagai network_error", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    expect(await fetchLayout(BASE_URL, "slz_valid")).toEqual({ ok: false, kind: "wrong_server" });
  });
});

describe("patchDeviceModel", () => {
  it("ok:true + data kalau 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ model: "P1S" }) });
    const result = await patchDeviceModel(BASE_URL, "slz_valid", "abc1234567", "P1S");
    expect(result).toEqual({ ok: true, data: { model: "P1S" } });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/agent/devices/abc1234567`,
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
    expect(await patchDeviceModel(BASE_URL, "slz_bad", "abc1234567", "P1S")).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await patchDeviceModel(BASE_URL, "slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await patchDeviceModel(BASE_URL, "slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:network_error kalau 404 (shortCode tak dikenal SaaS ini)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) });
    expect(await patchDeviceModel(BASE_URL, "slz_valid", "abc-lain", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:invalid_model kalau 400 { error: 'invalid_device_model' } -- beda dari network_error, model-nya yang ditolak", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_device_model" }) });
    expect(await patchDeviceModel(BASE_URL, "slz_valid", "abc1234567", "TerlaluPanjangUntukFirmware")).toEqual({ ok: false, kind: "invalid_model" });
  });

  it("kind:network_error kalau 400 dengan body error lain (bukan invalid_device_model)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "something_else" }) });
    expect(await patchDeviceModel(BASE_URL, "slz_valid", "abc1234567", "P1S")).toEqual({ ok: false, kind: "network_error" });
  });

  it("400 dengan body error invalid_device_model (dari brief, content-type headers.get gaya) -> kind invalid_model", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, headers: { get: () => "application/json" }, json: async () => ({ error: "invalid_device_model" }) });
    expect(await patchDeviceModel(BASE_URL, "t", "ABC", "very-long-model-name")).toEqual({ ok: false, kind: "invalid_model" });
  });
});

describe("fetchLatestVersion", () => {
  it("commitHash beda dari BUILD_INFO.commitHash build ini -> updateAvailable:true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "a3f9c21" }) });
    const result = await fetchLatestVersion(BASE_URL, "slz_valid", "win", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/agent/version?platform=win`,
      expect.objectContaining({ headers: { Authorization: "Bearer slz_valid", "X-Agent-Version": "0.0.0+nogit" }, signal: expect.any(AbortSignal) })
    );
  });

  it("commitHash SAMA dengan BUILD_INFO.commitHash build ini -> updateAvailable:false", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: "nogit" }) });
    const result = await fetchLatestVersion(BASE_URL, "slz_valid", "win", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
  });

  it("commitHash:null (belum pernah admin upload) -> updateAvailable:false, JANGAN pernah 'update available' palsu", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ commitHash: null }) });
    const result = await fetchLatestVersion(BASE_URL, "slz_valid", "mac", BUILD_INFO, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: false } });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/agent/version?platform=mac`,
      expect.anything()
    );
  });

  it("kind:invalid_token kalau 401", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
    expect(await fetchLatestVersion(BASE_URL, "slz_bad", "win", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "invalid_token" });
  });

  it("kind:entitlement_expired kalau 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "entitlement_expired" }) });
    expect(await fetchLatestVersion(BASE_URL, "slz_valid", "win", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "entitlement_expired" });
  });

  it("kind:network_error kalau fetch throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchLatestVersion(BASE_URL, "slz_valid", "win", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "network_error" });
  });

  it("kind:wrong_server kalau 200 tapi body HTML", async () => {
    // Persis respons placeholder Cloudflare Pages "Segera Hadir" di app.slizebiz.com (2026-08-22):
    // 200 text/html di SEMUA path, termasuk /api/agent/*.
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), json: async () => { throw new SyntaxError("Unexpected token <"); } });
    expect(await fetchLatestVersion(BASE_URL, "slz_valid", "win", BUILD_INFO, makeLogger())).toEqual({ ok: false, kind: "wrong_server" });
  });

  it("commitHash beda dari build (dari brief) -> updateAvailable true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ commitHash: "different" }) });
    const result = await fetchLatestVersion(BASE_URL, "t", "win", { version: "0.0.1", commitHash: "abc1234" }, makeLogger());
    expect(result).toEqual({ ok: true, data: { updateAvailable: true } });
  });
});

describe("uploadLogs", () => {
  it("POST ke /api/agent/logs dengan Content-Type text/plain, balikin ok:true kalau 2xx", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const result = await uploadLogs(BASE_URL, "t", Buffer.from("log content"), makeLogger());
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/agent/logs`, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer t", "Content-Type": "text/plain" }),
    }));
  });

  it("fetch gagal/reject -> ok:false reason upload_failed", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await uploadLogs(BASE_URL, "t", Buffer.from("x"), makeLogger())).toEqual({ ok: false, reason: "upload_failed" });
  });

  it("respons non-ok -> ok:false reason upload_failed", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await uploadLogs(BASE_URL, "t", Buffer.from("x"), makeLogger())).toEqual({ ok: false, reason: "upload_failed" });
  });
});
