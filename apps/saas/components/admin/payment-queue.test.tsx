// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentQueue, type PendingRow } from "./PaymentQueue";

const row = (o: Partial<PendingRow> = {}): PendingRow =>
  ({ id: "p1", amount: 149000, who: "a@b.c", ageMin: 5, marked: true, hasProof: true, ...o });

describe("PaymentQueue bukti", () => {
  it("hasProof → tampil img ke endpoint proof", () => {
    render(<PaymentQueue rows={[row()]} />);
    const img = screen.getByAltText(/bukti/i) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/beli/p1/proof");
  });
  it("tanpa bukti → tampil '—', tak ada img", () => {
    render(<PaymentQueue rows={[row({ hasProof: false })]} />);
    expect(screen.queryByAltText(/bukti/i)).toBeNull();
  });
  it("banner peringatan cek mutasi tetap ada", () => {
    render(<PaymentQueue rows={[row()]} />);
    expect(screen.getByText(/mutasi/i)).toBeTruthy();
  });
  it("gambar bukti gagal load → tampil fallback 'Bukti sudah kedaluwarsa'", () => {
    render(<PaymentQueue rows={[row()]} />);
    const img = screen.getByAltText(/bukti/i) as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByText(/kedaluwarsa/i)).toBeTruthy();
    expect(screen.queryByAltText(/bukti/i)).toBeNull();
  });
});
