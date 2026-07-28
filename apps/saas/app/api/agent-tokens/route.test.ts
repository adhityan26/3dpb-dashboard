import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/agent-tokens/service", () => ({ generateToken: vi.fn(), listTokens: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateToken, listTokens } from "@/lib/agent-tokens/service";
import { GET, POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("200 + list token kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (listTokens as any).mockResolvedValue([{ id: "t1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/agent-tokens", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("200 + token mentah kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (generateToken as any).mockResolvedValue({ id: "t1", rawToken: "slz_abc" });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("slz_abc");
  });
});
