// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";

const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3", ...over });
const base = { plates: [row()], batch: "1", onPlatesChange: vi.fn(), onBatchChange: vi.fn() };

describe("PlateInput", () => {
  it("locked → field berlabel + blok terkunci, tak ada tambah plate / batch", () => {
    render(<PlateInput {...base} locked={true} />);
    expect(screen.getByText(/Berat/)).toBeTruthy();
    expect(screen.getByText(/Multi-plate/)).toBeTruthy();
    expect(screen.queryByText(/tambah plate/)).toBeNull();
    expect(screen.queryByText(/Batch/)).toBeNull();
  });

  it("locked → mengubah gram tetap memanggil onPlatesChange", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={true} onPlatesChange={onP} />);
    fireEvent.change(screen.getByDisplayValue("50"), { target: { value: "70" } });
    expect(onP).toHaveBeenCalled();
    expect(onP.mock.calls[0][0][0]).toMatchObject({ gramasi: "70" });
  });

  it("unlocked → ＋ tambah plate menambah baris", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getByText(/tambah plate/));
    expect(onP.mock.calls[0][0]).toHaveLength(2);
    expect(onP.mock.calls[0][0][1].id).toBeTruthy();
  });

  it("unlocked → hapus plate; plate terakhir tak bisa dihapus", () => {
    // 1 plate → tak ada tombol hapus
    const { rerender } = render(<PlateInput {...base} locked={false} />);
    expect(screen.queryByLabelText(/Hapus plate/)).toBeNull();
    // 2 plate → ada tombol hapus, klik → sisa 1
    const onP = vi.fn();
    rerender(<PlateInput plates={[row(), row({ id: "p2" })]} batch="1" onBatchChange={vi.fn()} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getAllByLabelText(/Hapus plate/)[0]);
    expect(onP.mock.calls[0][0]).toHaveLength(1);
  });

  it("unlocked → baris TOTAL muncul saat >1 plate dengan jumlah benar", () => {
    render(<PlateInput plates={[row({ gramasi: "50", durasiJam: "3" }), row({ id: "p2", gramasi: "30", durasiJam: "2" })]} batch="1" onPlatesChange={vi.fn()} onBatchChange={vi.fn()} locked={false} />);
    expect(screen.getByText(/TOTAL/)).toBeTruthy();
    expect(screen.getByText(/80 g/)).toBeTruthy();
    expect(screen.getByText(/5 jam/)).toBeTruthy();
  });

  it("unlocked → field batch memanggil onBatchChange", () => {
    const onB = vi.fn();
    render(<PlateInput {...base} locked={false} onBatchChange={onB} />);
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "4" } });
    expect(onB).toHaveBeenCalledWith("4");
  });

  it("newPlateRow menghasilkan row kosong ber-id", () => {
    const r = newPlateRow();
    expect(r).toMatchObject({ nama: "", tipe: "FDM", gramasi: "", durasiJam: "" });
    expect(r.id).toBeTruthy();
  });
});

// Regresi bug produksi 2026-07-21: di http://<IP> crypto.randomUUID undefined.
describe("PlateInput tanpa crypto.randomUUID (http:// + IP)", () => {
  const asli = globalThis.crypto;
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: asli.getRandomValues.bind(asli) }, // randomUUID SENGAJA tak ada
      configurable: true, writable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", { value: asli, configurable: true, writable: true });
  });

  it("tambah plate tetap jalan & id truthy", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getByText(/tambah plate/));
    expect(onP.mock.calls[0][0]).toHaveLength(2);
    expect(onP.mock.calls[0][0][1].id).toBeTruthy();
  });
});
