import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn(), createDevice: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { listDevices, createDevice } from "@/lib/devices/service";
import { SlotLimitExceeded } from "@/lib/devices/errors";
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/devices", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("200 + list device kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listDevices as any).mockResolvedValue([{ id: "d1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/devices", () => {
  function req(body: unknown) {
    return new Request("http://x/api/devices", { method: "POST", body: JSON.stringify(body) });
  }

  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(403);
  });

  it("409 + pesan upsell kalau SlotLimitExceeded", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockRejectedValue(new SlotLimitExceeded(1));
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(409);
  });

  it("200 + device baru kalau lolos semua cek", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    (createDevice as any).mockResolvedValue({ id: "new-d" });
    const res = await POST(req({ label: "A", printerType: "bambu" }));
    expect(res.status).toBe(200);
  });
});
