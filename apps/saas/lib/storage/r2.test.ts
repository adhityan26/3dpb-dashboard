import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("aws4fetch", () => ({
  AwsClient: class { fetch = (...a: unknown[]) => fetchMock(...a); },
}));

import { r2Config, putProof, getProof, putBinary, getBinary, R2NotConfigured } from "./r2";

const ENV = { ...process.env };
beforeEach(() => {
  fetchMock.mockReset();
  process.env.R2_ACCOUNT_ID = "acc123";
  process.env.R2_ACCESS_KEY_ID = "ak";
  process.env.R2_SECRET_ACCESS_KEY = "sk";
  process.env.R2_BUCKET = "slizebiz-proofs";
});
afterEach(() => { process.env = { ...ENV }; });

describe("r2Config", () => {
  it("baca env lengkap", () => {
    expect(r2Config()).toEqual({ accountId: "acc123", accessKeyId: "ak", secretAccessKey: "sk", bucket: "slizebiz-proofs" });
  });
  it("throw R2NotConfigured bila env kurang", () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(() => r2Config()).toThrow(R2NotConfigured);
  });
});

describe("putProof", () => {
  it("PUT ke URL bucket/key dg Content-Type", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await putProof("proofs/p1.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acc123.r2.cloudflarestorage.com/slizebiz-proofs/proofs/p1.jpg");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("image/jpeg");
  });
  it("throw bila respons tak ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(putProof("k", new Uint8Array(), "image/jpeg")).rejects.toThrow();
  });
});

describe("getProof", () => {
  it("kembalikan body + contentType", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new ArrayBuffer(3),
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/png" : null) },
    });
    const out = await getProof("proofs/p1.jpg");
    expect(out?.contentType).toBe("image/png");
    expect(out?.body.byteLength).toBe(3);
  });
  it("null bila 404", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await getProof("hilang.jpg")).toBeNull();
  });
});

describe("putBinary/getBinary (aset installer Agent, bucket sama-prefix beda)", () => {
  it("putBinary PUT ke key agent/latest/... dg Content-Type", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await putBinary("agent/latest/win.exe", new Uint8Array([1, 2, 3]), "application/x-msdownload");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acc123.r2.cloudflarestorage.com/slizebiz-proofs/agent/latest/win.exe");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("application/x-msdownload");
  });

  it("getBinary kembalikan body + contentType", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new ArrayBuffer(5),
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-msdownload" : null) },
    });
    const out = await getBinary("agent/latest/win.exe");
    expect(out?.contentType).toBe("application/x-msdownload");
    expect(out?.body.byteLength).toBe(5);
  });

  it("getBinary null bila 404 (belum pernah di-upload admin)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await getBinary("agent/latest/mac.dmg")).toBeNull();
  });
});
