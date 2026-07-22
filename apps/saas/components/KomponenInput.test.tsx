// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KomponenInput } from "./KomponenInput";

const presets = [{ id: "k1", nama: "Gantungan kew-kew", harga: 900 }, { id: "k2", nama: "Switch", harga: 2500 }];

describe("KomponenInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<KomponenInput locked presets={presets} komponen={[]} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("klik chip preset → tambah baris komponen", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Gantungan kew-kew/ }));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900, qty: 1 });
  });
  it("chip preset aktif (sudah ada) → klik lagi menghapus", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "Gantungan kew-kew", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Gantungan kew-kew/ }));
    expect(onC).toHaveBeenCalledWith([]);
  });
  it("stepper + menaikkan qty, − menurunkan (min 1)", () => {
    const onC = vi.fn();
    const { rerender } = render(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "A", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByLabelText("Tambah qty"));
    expect(onC.mock.calls[0][0][0].qty).toBe(2);
    onC.mockClear();
    rerender(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "A", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByLabelText("Kurangi qty"));
    expect(onC.mock.calls[0][0][0].qty).toBe(1); // clamp min 1
  });
  it("Tambah komponen custom → baris kosong", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[]} onChange={onC} />);
    fireEvent.click(screen.getByText(/Tambah komponen custom/));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "", harga: 0, qty: 1 });
    expect(onC.mock.calls[0][0][0].id).toBeTruthy();
  });
});
