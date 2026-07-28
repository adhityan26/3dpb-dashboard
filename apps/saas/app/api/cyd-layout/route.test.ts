import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/cyd-layout/service", () => ({
  getLayout: vi.fn(),
  saveLayoutForUser: vi.fn(),
  InvalidLayoutConfig: class extends Error {
    status = 400;
  },
}));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { getLayout, saveLayoutForUser } from "@/lib/cyd-layout/service";
import { GET, PUT } from "./route";

beforeEach(() => vi.clearAllMocks());

/** requirePaidCore dipakai apa adanya (tak di-mock) — cukup atur auth + entitlement di baliknya. */
function loginAs(paidCore: boolean) {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (getEntitlement as any).mockResolvedValue({});
  (capabilities as any).mockReturnValue({ paidCore, cloud: false });
}

describe("GET /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    loginAs(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(getLayout).not.toHaveBeenCalled();
  });

  it("200 + layout (default kalau belum pernah simpan)", async () => {
    loginAs(true);
    (getLayout as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/cyd-layout", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    loginAs(false);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(403);
    expect(saveLayoutForUser).not.toHaveBeenCalled();
  });

  it("400 kalau saveLayoutForUser throw InvalidLayoutConfig", async () => {
    loginAs(true);
    const { InvalidLayoutConfig } = await import("@/lib/cyd-layout/service");
    (saveLayoutForUser as any).mockRejectedValue(new InvalidLayoutConfig("bad"));
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(400);
  });

  // Cek-kepemilikan device sekarang terjadi DI DALAM saveLayoutForUser (satu transaksi), jadi route
  // tak boleh lagi memanggil listDevices sendiri lalu mengoper shortCode-nya.
  it("200 + delegasi ke saveLayoutForUser(userId, body) tanpa listDevices terpisah", async () => {
    loginAs(true);
    (saveLayoutForUser as any).mockResolvedValue({ schemaVersion: 1, pages: [] });
    const body = { schemaVersion: 1, pages: [] };
    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    expect(saveLayoutForUser).toHaveBeenCalledWith("u1", body);
  });
});
