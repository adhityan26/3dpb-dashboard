import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getBinary: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { getBinary } from "@/lib/storage/r2";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

function loginAs(paidCore: boolean) {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (getEntitlement as any).mockResolvedValue({});
  (capabilities as any).mockReturnValue({ paidCore, cloud: false });
}

function req() {
  return new Request("http://x/api/agent/binary/win");
}

describe("GET /api/agent/binary/[platform]", () => {
  it("401 kalau tak login (requirePaidCore apa adanya)", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.status).toBe(401);
    expect(getBinary).not.toHaveBeenCalled();
  });

  it("403 kalau bukan paidCore", async () => {
    loginAs(false);
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.status).toBe(403);
    expect(getBinary).not.toHaveBeenCalled();
  });

  it("404 unknown_platform kalau platform bukan win/mac", async () => {
    loginAs(true);
    const res = await GET(req(), { params: Promise.resolve({ platform: "linux" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown_platform");
  });

  it("200 + stream binary win dari R2, header Content-Disposition attachment", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-msdownload" });
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.status).toBe(200);
    expect(getBinary).toHaveBeenCalledWith("agent/latest/win.exe");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Slizebiz-Agent-Setup.exe"');
    expect(res.headers.get("Content-Type")).toBe("application/x-msdownload");
  });

  it("mac -> key & filename beda dari win", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-apple-diskimage" });
    const res = await GET(new Request("http://x/api/agent/binary/mac"), { params: Promise.resolve({ platform: "mac" }) });
    expect(getBinary).toHaveBeenCalledWith("agent/latest/mac.dmg");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Slizebiz-Agent.dmg"');
  });

  it("200 + metadata version/commit ada -- nama file dinamis bawa versi+hash (bukan nama generik)", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-msdownload", version: "0.0.1", commitHash: "a3f9c21" });
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Slizebiz-Agent-Setup-0.0.1-a3f9c21.exe"');
  });

  it("mac + metadata -- nama file dinamis pakai pola mac juga", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-apple-diskimage", version: "0.0.1", commitHash: "a3f9c21" });
    const res = await GET(new Request("http://x/api/agent/binary/mac"), { params: Promise.resolve({ platform: "mac" }) });
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Slizebiz-Agent-0.0.1-a3f9c21.dmg"');
  });

  it("kirim header Content-Length kalau R2 kasih contentLength -- browser bisa tampilkan progress bar bukan cuma spinner indeterminate", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-msdownload", contentLength: 5242880 });
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.headers.get("Content-Length")).toBe("5242880");
  });

  it("contentLength null (R2 gak kasih header) -- Content-Length dilewatkan, bukan dikirim '0'/'null' yang salah", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue({ body: new ArrayBuffer(4), contentType: "application/x-msdownload", contentLength: null });
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.headers.get("Content-Length")).toBeNull();
  });

  it("404 binary_not_uploaded kalau admin belum pernah upload (getBinary null)", async () => {
    loginAs(true);
    (getBinary as any).mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("binary_not_uploaded");
  });

  it("503 storage_unavailable kalau getBinary throw (mis. R2 belum dikonfigurasi)", async () => {
    loginAs(true);
    (getBinary as any).mockRejectedValue(new Error("r2_get_failed_500"));
    const res = await GET(req(), { params: Promise.resolve({ platform: "win" }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("storage_unavailable");
  });
});
