import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ getEntitlement: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/printer-slots/capacity", () => ({ hasActiveSlotGrant: vi.fn() }));

import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { hasActiveSlotGrant } from "@/lib/printer-slots/capacity";
import { requirePaidCore, requireAgentAccess } from "./session-auth";

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

describe("requireAgentAccess", () => {
  it("401 kalau tak ada session", async () => {
    (auth as any).mockResolvedValue(null);
    const result = await requireAgentAccess();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("403 forbidden kalau paidCore false DAN tak punya slot grant aktif", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    (hasActiveSlotGrant as any).mockResolvedValue(false);
    const result = await requireAgentAccess();
    expect((result as NextResponse).status).toBe(403);
    expect(await (result as NextResponse).json()).toEqual({ error: "forbidden" });
  });

  it("balikin { userId } kalau paidCore true (short-circuit, tak perlu cek slot grant)", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: true, cloud: false });
    expect(await requireAgentAccess()).toEqual({ userId: "u1" });
  });

  it("balikin { userId } kalau paidCore false TAPI punya slot grant aktif (regresi N2 whole-feature review)", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (getEntitlement as any).mockResolvedValue({});
    (capabilities as any).mockReturnValue({ paidCore: false, cloud: false });
    (hasActiveSlotGrant as any).mockResolvedValue(true);
    expect(await requireAgentAccess()).toEqual({ userId: "u1" });
  });
});
