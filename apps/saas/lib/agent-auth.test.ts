import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-tokens/service", () => ({ resolveToken: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));

import { resolveToken } from "@/lib/agent-tokens/service";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { requireAgentToken } from "./agent-auth";

beforeEach(() => vi.clearAllMocks());

function req(auth?: string) {
  const headers = new Headers();
  if (auth) headers.set("Authorization", auth);
  return new Request("http://x/api/agent/devices", { headers });
}

describe("requireAgentToken", () => {
  it("401 kalau header Authorization absen", async () => {
    const result = await requireAgentToken(req());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("401 kalau format bukan 'Bearer <token>'", async () => {
    const result = await requireAgentToken(req("Basic xxx"));
    expect((result as NextResponse).status).toBe(401);
  });

  it("401 kalau token tak dikenal/revoked (resolveToken null)", async () => {
    (resolveToken as any).mockResolvedValue(null);
    const result = await requireAgentToken(req("Bearer slz_invalid"));
    expect((result as NextResponse).status).toBe(401);
  });

  it("403 entitlement_expired kalau paidCore false", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    const result = await requireAgentToken(req("Bearer slz_valid"));
    expect((result as NextResponse).status).toBe(403);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("entitlement_expired");
  });

  it("balikin { userId } kalau semua valid", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    const result = await requireAgentToken(req("Bearer slz_valid"));
    expect(result).toEqual({ userId: "u1" });
  });

  it("header X-Agent-Version diteruskan ke resolveToken (dicatat server buat diagnosa versi user)", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    const headers = new Headers();
    headers.set("Authorization", "Bearer slz_valid");
    headers.set("X-Agent-Version", "0.3.1");
    await requireAgentToken(new Request("http://x/api/agent/devices", { headers }));
    expect(resolveToken).toHaveBeenCalledWith("slz_valid", "0.3.1");
  });

  it("header X-Agent-Version absen -> resolveToken tetap dipanggil dgn null (bukan undefined nyangkut aneh)", async () => {
    (resolveToken as any).mockResolvedValue({ userId: "u1" });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    await requireAgentToken(req("Bearer slz_valid"));
    expect(resolveToken).toHaveBeenCalledWith("slz_valid", null);
  });
});
