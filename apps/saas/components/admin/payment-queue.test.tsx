// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentQueue, type PendingRow } from "./PaymentQueue";

const row = (o: Partial<PendingRow> = {}): PendingRow =>
  ({ id: "p1", amount: 149000, who: "a@b.c", ageMin: 5, marked: true, hasProof: true, productType: "BELI", quantity: null, ...o });

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

  it("shows a Produk column with quantity for a SLOT_PURCHASE row", () => {
    render(<PaymentQueue rows={[
      { id: "p1", amount: 30000, who: "u1", ageMin: 5, marked: false, hasProof: false, productType: "SLOT_PURCHASE", quantity: 3 },
    ]} />);
    expect(screen.getByText("Slot ×3")).toBeTruthy();
  });

  it("shows 'Pro (lifetime)' for a BELI row", () => {
    render(<PaymentQueue rows={[
      { id: "p2", amount: 150000, who: "u2", ageMin: 2, marked: false, hasProof: false, productType: "BELI", quantity: null },
    ]} />);
    expect(screen.getByText("Pro (lifetime)")).toBeTruthy();
  });

  it("shows the raw productType for an unrecognized product, not 'Pro (lifetime)'", () => {
    render(<PaymentQueue rows={[
      { id: "p3", amount: 99000, who: "u3", ageMin: 1, marked: false, hasProof: false, productType: "UNKNOWN_PRODUCT", quantity: null },
    ]} />);
    expect(screen.getByText("UNKNOWN_PRODUCT")).toBeTruthy();
    expect(screen.queryByText("Pro (lifetime)")).toBeNull();
  });

  it("shows a Produk column with quantity for a CYD_PURCHASE row", () => {
    render(<PaymentQueue rows={[
      { id: "p4", amount: 200000, who: "u4", ageMin: 3, marked: false, hasProof: false, productType: "CYD_PURCHASE", quantity: 2 },
    ]} />);
    expect(screen.getByText("CYD ×2")).toBeTruthy();
  });
});
