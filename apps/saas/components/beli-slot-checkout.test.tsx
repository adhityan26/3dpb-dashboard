// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,x") } }));
vi.mock("@/lib/image/compress", () => ({
  compressImage: async (f: File) => new Blob([f], { type: f.type }),
  fitDimensions: (w: number, h: number) => ({ w, h }),
}));
import { BeliSlotCheckout } from "@/components/BeliSlotCheckout";

beforeEach(() => vi.restoreAllMocks());

describe("BeliSlotCheckout", () => {
  it("computes and displays the live total as quantity changes", () => {
    render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
    const qtyInput = screen.getByLabelText(/jumlah slot/i);
    fireEvent.change(qtyInput, { target: { value: "3" } });
    expect(screen.getByText(/Rp30.000/)).toBeTruthy();
  });

  it("posts the chosen quantity when checking out", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 29500, qrPayload: "QR", displayPrice: 30000, quantity: 3 }),
    } as Response);
    render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
    fireEvent.change(screen.getByLabelText(/jumlah slot/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/slot/checkout", expect.objectContaining({
      method: "POST", body: JSON.stringify({ quantity: 3 }),
    })));
  });

  it("shows an error message when the API returns 400 (invalid quantity)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_quantity" }) } as Response);
    render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    await waitFor(() => expect(screen.getByText(/jumlah slot tidak valid/i)).toBeTruthy());
  });
});

describe("bukti wajib (mirrors BeliCheckout)", () => {
  it("tombol 'Saya sudah bayar' disabled sebelum pilih file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 29500, qrPayload: "QR", displayPrice: 30000, quantity: 3 }),
    } as Response);
    render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    const btn = await screen.findByText(/Saya sudah bayar/i);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("pilih file → tombol aktif, submit kirim FormData berisi 'bukti'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 29500, qrPayload: "QR", displayPrice: 30000, quantity: 3 }),
    } as Response);
    render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    const file = new File(["x"], "bukti.jpg", { type: "image/jpeg" });
    const input = await screen.findByLabelText(/bukti/i);
    fireEvent.change(input, { target: { files: [file] } });
    const btn = await screen.findByText(/Saya sudah bayar/i);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => {
      const call = (globalThis.fetch as any).mock.calls.find((c: unknown[]) => String(c[0]).includes("mark-paid"));
      expect(call).toBeTruthy();
      expect(call[1].body instanceof FormData).toBe(true);
      expect((call[1].body as FormData).get("bukti")).toBeTruthy();
    });
  });
});
