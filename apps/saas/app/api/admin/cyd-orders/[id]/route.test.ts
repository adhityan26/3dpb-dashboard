import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/owner", () => ({ isOwner: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ updateCydShipping: vi.fn() }));

import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { updateCydShipping } from "@/lib/payment/service";
import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

it("403 when not owner", async () => {
  (auth as any).mockResolvedValue({ user: { email: "notowner@x.com" } });
  (isOwner as any).mockReturnValue(false);
  const res = await PATCH(req({ shippingStatus: "PACKED" }), ctx("p1"));
  expect(res.status).toBe(403);
});

it("updates shipping fields for an owner", async () => {
  (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
  (isOwner as any).mockReturnValue(true);
  (updateCydShipping as any).mockResolvedValue({ id: "p1", shippingCost: 25000, shippingStatus: "SHIPPED" });
  const res = await PATCH(req({ shippingCost: 25000, shippingStatus: "SHIPPED" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(updateCydShipping).toHaveBeenCalledWith("p1", { shippingCost: 25000, shippingStatus: "SHIPPED" });
});

it("400 when updateCydShipping rejects", async () => {
  (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
  (isOwner as any).mockReturnValue(true);
  (updateCydShipping as any).mockRejectedValue(new Error("invalid_shipping_status"));
  const res = await PATCH(req({ shippingStatus: "LOST" }), ctx("p1"));
  expect(res.status).toBe(400);
});
