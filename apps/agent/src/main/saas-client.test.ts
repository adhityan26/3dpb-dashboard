import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDevices, fetchLayout } from "./saas-client";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
  process.env.SAAS_BASE_URL = "http://192.168.88.113:3300";
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
