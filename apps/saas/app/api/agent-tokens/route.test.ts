import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/agent-tokens/service", () => ({ generateToken: vi.fn(), listTokens: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

/** requirePaidCore dipakai apa adanya (tak di-mock) — cukup atur auth + entitlement di baliknya. */
function loginAs(paidCore: boolean) {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (getEntitlement as any).mockResolvedValue({});
  (capabilities as any).mockReturnValue({ paidCore, cloud: false });
}

describe("GET /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    loginAs(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(listTokens).not.toHaveBeenCalled();
  });

  it("200 + list token kalau login & paidCore", async () => {
    loginAs(true);
    (listTokens as any).mockResolvedValue([{ id: "t1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listTokens).toHaveBeenCalledWith("u1");
  });
});

describe("POST /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("403 kalau bukan paidCore", async () => {
    loginAs(false);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(generateToken).not.toHaveBeenCalled();
  });

  it("200 + token mentah kalau login & paidCore", async () => {
    loginAs(true);
    (generateToken as any).mockResolvedValue({ id: "t1", rawToken: "slz_abc" });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("slz_abc");
  });
});
