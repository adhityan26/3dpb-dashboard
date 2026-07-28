import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/devices/service", () => ({ listDevices: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { listDevices } from "@/lib/devices/service";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent/devices", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("200 + device list kalau auth sukses", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (listDevices as any).mockResolvedValue([{ id: "d1", shortCode: "abc1234567" }]);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
  });
});
