import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/agent-tokens/service", () => ({ revokeToken: vi.fn() }));

import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/agent-tokens/service";
import { DELETE } from "./route";

beforeEach(() => vi.clearAllMocks());

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/agent-tokens/[id]", () => {
  it("401 kalau tak login", async () => {
    (auth as any).mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(401);
  });

  it("204 + panggil revokeToken(userId, id) kalau login", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(204);
    expect(revokeToken).toHaveBeenCalledWith("u1", "t1");
  });
});
