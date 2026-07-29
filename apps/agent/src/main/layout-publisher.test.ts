import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./saas-client", () => ({ fetchLayout: vi.fn() }));

const publishAsyncMock = vi.fn().mockResolvedValue(undefined);
const endAsyncMock = vi.fn().mockResolvedValue(undefined);
vi.mock("mqtt", () => ({
  default: { connectAsync: vi.fn(() => Promise.resolve({ publishAsync: publishAsyncMock, endAsync: endAsyncMock })) },
}));

import { fetchLayout } from "./saas-client";
import { publishLayout } from "./layout-publisher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishLayout", () => {
  it("skip publish (published:false) kalau layout belum diatur (data:null)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: true, data: null });
    const result = await publishLayout("slz_x", 1883);
    expect(result).toEqual({ published: false });
    expect(publishAsyncMock).not.toHaveBeenCalled();
  });

  it("publish retained ke topic 3dpb/cyd/<deviceId>/layout kalau layout ada", async () => {
    const layout = { schemaVersion: 1, pages: [{ id: "p1", cells: [] }] };
    (fetchLayout as any).mockResolvedValue({ ok: true, data: layout });
    const result = await publishLayout("slz_x", 1883, "my-cyd-1");
    expect(result).toEqual({ published: true });
    expect(publishAsyncMock).toHaveBeenCalledWith("3dpb/cyd/my-cyd-1/layout", JSON.stringify(layout), { retain: true });
  });

  it("skip publish kalau fetchLayout gagal (network_error dll)", async () => {
    (fetchLayout as any).mockResolvedValue({ ok: false, kind: "network_error" });
    const result = await publishLayout("slz_x", 1883);
    expect(result).toEqual({ published: false });
  });
});
