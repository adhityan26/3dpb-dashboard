// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BeliSubscribeCheckout } from "./BeliSubscribeCheckout";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,x")) } }));

beforeEach(() => {
  vi.restoreAllMocks();
});

it("shows the owner-discount hint when isOwner is true", () => {
  render(<BeliSubscribeCheckout price="35000" refundCopy="Refund copy" isOwner={true} />);
  expect(screen.getByText(/harga khusus/i)).toBeTruthy();
});

it("does not show the owner-discount hint when isOwner is false", () => {
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  expect(screen.queryByText(/harga khusus/i)).toBeNull();
});

it("posts to the subscribe checkout endpoint with no body when checking out", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true, status: 200, json: async () => ({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 }),
  } as Response);
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/subscribe/checkout", { method: "POST" }));
});

it("shows a 503 message when payment isn't active yet", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "price_not_set" }) } as Response);
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(screen.getByText(/belum aktif/i)).toBeTruthy());
});
