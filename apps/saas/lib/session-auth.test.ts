import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { requirePaidCore } from "./session-auth";

beforeEach(() => vi.clearAllMocks());

describe("requirePaidCore", () => {
  it("401 kalau tak ada session", async () => {
    (auth as any).mockResolvedValue(null);
    const result = await requirePaidCore();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("403 forbidden kalau paidCore false", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    const result = await requirePaidCore();
    expect((result as NextResponse).status).toBe(403);
    expect(await (result as NextResponse).json()).toEqual({ error: "forbidden" });
  });

  it("balikin { userId } kalau paidCore true", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    expect(await requirePaidCore()).toEqual({ userId: "u1" });
  });
});
