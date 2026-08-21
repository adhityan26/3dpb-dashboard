import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ headBinary: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { headBinary } from "@/lib/storage/r2";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent/version", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(401);
    expect(headBinary).not.toHaveBeenCalled();
  });

  it("platform param hilang -> 400 invalid_platform", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_platform" });
  });

  it("platform param tak dikenal -> 400 invalid_platform", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    const res = await GET(new Request("http://x?platform=linux"));
    expect(res.status).toBe(400);
  });

  it("platform=win -> 200 dengan commitHash dari headBinary key agent/latest/win.exe", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue({ version: "0.0.1", commitHash: "a3f9c21" });
    const res = await GET(new Request("http://x?platform=win"));
    expect(headBinary).toHaveBeenCalledWith("agent/latest/win.exe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commitHash: "a3f9c21" });
  });

  it("platform=mac -> pakai key agent/latest/mac.dmg", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue({ version: "0.0.1", commitHash: "a3f9c21" });
    await GET(new Request("http://x?platform=mac"));
    expect(headBinary).toHaveBeenCalledWith("agent/latest/mac.dmg");
  });

  it("headBinary balikin null (belum pernah upload) -> 200 commitHash:null", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockResolvedValue(null);
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commitHash: null });
  });

  it("headBinary throw (R2 down) -> 503 storage_unavailable", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (headBinary as any).mockRejectedValue(new Error("r2 down"));
    const res = await GET(new Request("http://x?platform=win"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "storage_unavailable" });
  });
});
