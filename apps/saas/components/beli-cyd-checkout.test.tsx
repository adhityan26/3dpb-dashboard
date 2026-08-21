// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,x") } }));
vi.mock("@/lib/image/compress", () => ({
  compressImage: async (f: File) => new Blob([f], { type: f.type }),
  fitDimensions: (w: number, h: number) => ({ w, h }),
}));
import { BeliCydCheckout } from "@/components/BeliCydCheckout";

const VARIANTS = [
  { id: "v1", label: "CYD Standar (dengan casing)", price: 250000 },
  { id: "v2", label: "CYD Standar (tanpa casing)", price: 180000 },
];

beforeEach(() => vi.restoreAllMocks());

describe("BeliCydCheckout", () => {
  it("computes the live total from the selected variant and quantity", () => {
    render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
    fireEvent.click(screen.getByLabelText(/tanpa casing/i));
    fireEvent.change(screen.getByLabelText(/jumlah/i), { target: { value: "2" } });
    expect(screen.getByText(/Rp360.000/)).toBeTruthy();
  });

  it("posts variant, quantity, and shipping address when checking out", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 359500, qrPayload: "QR", displayPrice: 360000, quantity: 2, cydVariantId: "v2", shippingAddress: "Jl. Contoh 1" }),
    } as Response);
    render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
    fireEvent.click(screen.getByLabelText(/tanpa casing/i));
    fireEvent.change(screen.getByLabelText(/jumlah/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/alamat/i), { target: { value: "Jl. Contoh 1" } });
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/cyd/checkout", expect.objectContaining({
      method: "POST", body: JSON.stringify({ cydVariantId: "v2", quantity: 2, shippingAddress: "Jl. Contoh 1" }),
    })));
  });

  it("shows an error when shipping address is missing on submit (400)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_shipping_address" }) } as Response);
    render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    await waitFor(() => expect(screen.getByText(/alamat kirim wajib diisi/i)).toBeTruthy());
  });
});

describe("bukti wajib (mirrors BeliSlotCheckout)", () => {
  it("tombol 'Saya sudah bayar' disabled sebelum pilih file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 249500, qrPayload: "QR", displayPrice: 250000, quantity: 1, cydVariantId: "v1", shippingAddress: "Jl. Contoh 1" }),
    } as Response);
    render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
    fireEvent.change(screen.getByLabelText(/alamat/i), { target: { value: "Jl. Contoh 1" } });
    fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
    const btn = await screen.findByText(/Saya sudah bayar/i);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("pilih file → tombol aktif, submit kirim FormData berisi 'bukti'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: "p1", amount: 249500, qrPayload: "QR", displayPrice: 250000, quantity: 1, cydVariantId: "v1", shippingAddress: "Jl. Contoh 1" }),
    } as Response);
    render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
    fireEvent.change(screen.getByLabelText(/alamat/i), { target: { value: "Jl. Contoh 1" } });
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
