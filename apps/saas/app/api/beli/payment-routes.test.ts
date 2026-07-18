import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/owner", () => ({ isOwner: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({
  createOrReuseCheckout: vi.fn(), markPaid: vi.fn(), activate: vi.fn(), cancel: vi.fn(), deactivate: vi.fn(),
}));
vi.mock("@/lib/payment/notify", () => ({ notifyActivated: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { createOrReuseCheckout, activate } from "@/lib/payment/service";
import { notifyActivated } from "@/lib/payment/notify";
import { prisma } from "@/lib/db";
import { AlreadyOwned, QrisNotSet } from "@/lib/payment/errors";
import { POST as checkoutPOST } from "@/app/api/beli/checkout/route";
import { PUT as activatePUT } from "@/app/api/admin/payment/[id]/activate/route";

const req = (body?: unknown) => new Request("http://x", { method: "POST", body: body ? JSON.stringify(body) : undefined });
beforeEach(() => vi.clearAllMocks());

describe("checkout", () => {
  it("anon → 401", async () => {
    (auth as any).mockResolvedValue(null);
    expect((await checkoutPOST(req())).status).toBe(401);
  });
  it("sukses → 200 payload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockResolvedValue({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 });
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).amount).toBe(149347);
  });
  it("AlreadyOwned → 200 {owned:true}", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new AlreadyOwned());
    const res = await checkoutPOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).owned).toBe(true);
  });
  it("QrisNotSet → 503", async () => {
    (auth as any).mockResolvedValue({ user: { id: "u1" } });
    (createOrReuseCheckout as any).mockRejectedValue(new QrisNotSet());
    expect((await checkoutPOST(req())).status).toBe(503);
  });
});

describe("admin activate", () => {
  const ctx = { params: Promise.resolve({ id: "p1" }) };
  it("non-owner → 403", async () => {
    (auth as any).mockResolvedValue({ user: { email: "x@y.com" } });
    (isOwner as any).mockReturnValue(false);
    expect((await activatePUT(req(), ctx)).status).toBe(403);
  });
  it("owner → activate + notif + 200", async () => {
    (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
    (isOwner as any).mockReturnValue(true);
    (activate as any).mockResolvedValue({ id: "p1", userId: "u1" });
    (prisma.user.findUnique as any).mockResolvedValue({ phone: "628111", email: null });
    const res = await activatePUT(req(), ctx);
    expect(res.status).toBe(200);
    expect(notifyActivated).toHaveBeenCalledWith({ phone: "628111", email: null });
  });
});
