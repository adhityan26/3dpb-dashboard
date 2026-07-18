// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,x") } }));
import { BeliCheckout } from "@/components/BeliCheckout";

beforeEach(() => vi.restoreAllMocks());

describe("BeliCheckout", () => {
  it("klik Beli → checkout → tampil nominal + QR", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="Refund 7 hari" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
    await waitFor(() => expect(screen.getByText(/149.347/)).toBeTruthy());
    await waitFor(() => expect(screen.getByAltText("QRIS")).toBeTruthy());
  });
  it("owned → pesan sudah punya", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ owned: true }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="x" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
    await waitFor(() => expect(screen.getByText(/sudah punya/i)).toBeTruthy());
  });
});
