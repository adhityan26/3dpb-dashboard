import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createOrReuseSubscribeCheckout: vi.fn() }));

import { auth } from "@/lib/auth";
import { createOrReuseSubscribeCheckout } from "@/lib/payment/service";
import { PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

it("401 when unauthenticated", async () => {
  (auth as any).mockResolvedValue(null);
  const res = await POST();
  expect(res.status).toBe(401);
});

it("creates a checkout and returns invoice fields", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createOrReuseSubscribeCheckout as any).mockResolvedValue({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 });
  const res = await POST();
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 });
});

it("503 when createOrReuseSubscribeCheckout throws PriceNotSet", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createOrReuseSubscribeCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST();
  expect(res.status).toBe(503);
});
