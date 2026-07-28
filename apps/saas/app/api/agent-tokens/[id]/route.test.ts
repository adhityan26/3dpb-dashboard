import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

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
    (revokeToken as any).mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(204);
    expect(revokeToken).toHaveBeenCalledWith("u1", "t1");
  });

  it("404 (bukan 500) kalau id tak ada / milik user lain — Prisma P2025", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (revokeToken as any).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record to update not found.", { code: "P2025", clientVersion: "7.7.0" })
    );
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t-orang-lain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("500 kalau error lain (bukan P2025)", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (revokeToken as any).mockRejectedValue(new Error("koneksi putus"));
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("t1"));
    expect(res.status).toBe(500);
  });
});
