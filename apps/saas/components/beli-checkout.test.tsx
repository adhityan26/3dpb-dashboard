// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,x") } }));
vi.mock("@/lib/image/compress", () => ({
  compressImage: async (f: File) => new Blob([f], { type: f.type }),
  fitDimensions: (w: number, h: number) => ({ w, h }),
}));
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

describe("1c-2 bukti wajib", () => {
  it("tombol 'Saya sudah bayar' disabled sebelum pilih file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="Refund 7 hari" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
    const btn = await screen.findByText(/Saya sudah bayar/i);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
  it("pilih file → tombol aktif, submit kirim FormData berisi 'bukti'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ id: "p1", amount: 149347, qrPayload: "Q", displayPrice: 150000 }) } as Response);
    render(<BeliCheckout displayPrice="150000" refundCopy="Refund 7 hari" />);
    fireEvent.click(screen.getByText("Beli sekarang"));
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
