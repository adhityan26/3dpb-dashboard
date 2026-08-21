import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createSlotCheckout: vi.fn() }));

import { auth } from "@/lib/auth";
import { createSlotCheckout } from "@/lib/payment/service";
import { InvalidQuantity, PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x/api/beli/slot/checkout", { method: "POST", body: JSON.stringify(body) });
}

it("401 when unauthenticated", async () => {
  (auth as any).mockResolvedValue(null);
  const res = await POST(req({ quantity: 2 }));
  expect(res.status).toBe(401);
});

it("creates a checkout and returns invoice fields including quantity", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockResolvedValue({ id: "p1", amount: 5000, qrPayload: "QR", displayPrice: 6000, quantity: 3 });
  const res = await POST(req({ quantity: 3 }));
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 5000, qrPayload: "QR", displayPrice: 6000, quantity: 3 });
  expect(createSlotCheckout).toHaveBeenCalledWith("u1", 3);
});

it("400 when createSlotCheckout throws InvalidQuantity", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockRejectedValue(new InvalidQuantity());
  const res = await POST(req({ quantity: 0 }));
  expect(res.status).toBe(400);
});

it("503 when createSlotCheckout throws PriceNotSet", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST(req({ quantity: 1 }));
  expect(res.status).toBe(503);
});
