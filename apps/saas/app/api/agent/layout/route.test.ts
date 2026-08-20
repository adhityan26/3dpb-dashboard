import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/cyd-layout/service", () => ({ getLayoutOrNull: vi.fn() }));
vi.mock("@/lib/printer-slots/capacity", () => ({ getEligibleShortCodes: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";
import { getEligibleShortCodes } from "@/lib/printer-slots/capacity";
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent/layout", () => {
  it("terusin response error dari requireAgentToken kalau gagal auth", async () => {
    const errRes = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    (requireAgentToken as any).mockResolvedValue(errRes);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("200 + layout kalau auth sukses dan layout ada", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (getEligibleShortCodes as any).mockResolvedValue(new Set());
    const layout = { pages: [] };
    (getLayoutOrNull as any).mockResolvedValue(layout);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(layout);
  });

  it("404 no_layout kalau auth sukses tapi layout belum ada", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (getLayoutOrNull as any).mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_layout");
  });

  it("strips cells referencing a suspended (ineligible) device", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (getEligibleShortCodes as any).mockResolvedValue(new Set(["eligible-1"]));
    (getLayoutOrNull as any).mockResolvedValue({
      schemaVersion: 1,
      pages: [
        {
          id: "page-1",
          grid: { cols: 2, rows: 2 },
          fields: [],
          durationSec: 5,
          cells: [
            { printer: "eligible-1", x: 0, y: 0 },
            { printer: "suspended-1", x: 1, y: 0 },
          ],
        },
      ],
    });

    const res = await GET(new Request("http://x/api/agent/layout"));
    const body = await res.json();

    expect(body.pages[0].cells).toEqual([{ printer: "eligible-1", x: 0, y: 0 }]);
  });

  it("leaves non-printer cells (type-only) untouched", async () => {
    (requireAgentToken as any).mockResolvedValue({ userId: "u1" });
    (getEligibleShortCodes as any).mockResolvedValue(new Set());
    (getLayoutOrNull as any).mockResolvedValue({
      schemaVersion: 1,
      pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ type: "clock", x: 0, y: 0 }] }],
    });

    const res = await GET(new Request("http://x/api/agent/layout"));
    const body = await res.json();

    expect(body.pages[0].cells).toEqual([{ type: "clock", x: 0, y: 0 }]);
  });
});
