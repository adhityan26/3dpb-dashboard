import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session-auth", () => ({ requirePaidCore: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createOrReuseCydCheckout: vi.fn() }));

import { requirePaidCore } from "@/lib/session-auth";
import { createOrReuseCydCheckout } from "@/lib/payment/service";
import { InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";
import { NextResponse } from "next/server";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x/api/beli/cyd/checkout", { method: "POST", body: JSON.stringify(body) });
}

it("returns the gate's response when not paidCore", async () => {
  (requirePaidCore as any).mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(403);
});

it("creates a checkout and returns invoice fields", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockResolvedValue({
    id: "p1", amount: 199000, qrPayload: "QR", displayPrice: 200000, quantity: 2, cydVariantId: "v1", shippingAddress: "Jl. X",
  });
  const res = await POST(req({ cydVariantId: "v1", quantity: 2, shippingAddress: "Jl. X" }));
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 199000, qrPayload: "QR", displayPrice: 200000, quantity: 2, cydVariantId: "v1", shippingAddress: "Jl. X" });
  expect(createOrReuseCydCheckout).toHaveBeenCalledWith("u1", "v1", 2, "Jl. X");
});

it("400 when InvalidQuantity", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidQuantity());
  const res = await POST(req({ cydVariantId: "v1", quantity: 0, shippingAddress: "X" }));
  expect(res.status).toBe(400);
});

it("400 when InvalidShippingAddress", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidShippingAddress());
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "" }));
  expect(res.status).toBe(400);
});

it("400 when InvalidCydVariant", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidCydVariant());
  const res = await POST(req({ cydVariantId: "bad", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(400);
});

it("503 when PriceNotSet", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(503);
});
