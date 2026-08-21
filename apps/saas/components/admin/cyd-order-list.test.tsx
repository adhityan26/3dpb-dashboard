// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CydOrderList, type CydOrderRow } from "./CydOrderList";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
});

const ROWS: CydOrderRow[] = [
  { id: "p1", who: "u1@x.com", quantity: 2, shippingAddress: "Jl. Contoh 1", shippingCost: null, shippingStatus: null },
];

it("shows the shipping address and a status dropdown", () => {
  render(<CydOrderList rows={ROWS} />);
  expect(screen.getByText("Jl. Contoh 1")).toBeTruthy();
  expect(screen.getByLabelText(/status kirim/i)).toBeTruthy();
});

it("PATCHes the order when shippingStatus changes", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  render(<CydOrderList rows={ROWS} />);
  fireEvent.change(screen.getByLabelText(/status kirim/i), { target: { value: "SHIPPED" } });
  expect(fetchSpy).toHaveBeenCalledWith("/api/admin/cyd-orders/p1", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ shippingStatus: "SHIPPED" }),
  }));
});
