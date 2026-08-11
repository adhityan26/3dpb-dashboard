import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./saas-client", () => ({ fetchLayout: vi.fn() }));

const publishAsyncMock = vi.fn().mockResolvedValue(undefined);
const endAsyncMock = vi.fn().mockResolvedValue(undefined);
const connectAsyncMock = vi.fn((..._args: any[]) => Promise.resolve({ publishAsync: publishAsyncMock, endAsync: endAsyncMock }));
vi.mock("mqtt", () => ({
  default: { connectAsync: (...args: any[]) => connectAsyncMock(...args) },
}));

import { fetchLayout } from "./saas-client";
import { publishLayout } from "./layout-publisher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishLayout", () => {
  it("skip publish (published:false) kalau layout belum diatur (data:null)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: null });
    const result = await publishLayout("slz_x", 1883, "default", "1234");
    expect(result).toEqual({ published: false });
    expect(publishAsyncMock).not.toHaveBeenCalled();
  });

  it("publish retained ke topic 3dpb/cyd/<deviceId>/layout kalau layout ada", async () => {
    const layout = { schemaVersion: 1, pages: [{ id: "p1", cells: [] }] };
    (fetchLayout as any).mockResolvedValue({ ok: true, data: layout });
    const result = await publishLayout("slz_x", 1883, "my-cyd-1", "1234");
    expect(result).toEqual({ published: true });
    expect(publishAsyncMock).toHaveBeenCalledWith("3dpb/cyd/my-cyd-1/layout", JSON.stringify(layout), { retain: true });
  });

  it("skip publish kalau fetchLayout gagal (network_error dll)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: false, kind: "network_error" });
    const result = await publishLayout("slz_x", 1883, "default", "1234");
    expect(result).toEqual({ published: false });
  });

  it("connect pakai PIN sebagai password + username placeholder", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: { schemaVersion: 1, pages: [] } });
    await publishLayout("slz_x", 1883, "default", "9042");
    expect(connectAsyncMock).toHaveBeenCalledWith(
      "mqtt://127.0.0.1:1883",
      expect.objectContaining({ username: expect.any(String), password: "9042" }),
    );
  });
});
