// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";

const mat = (over = {}) => ({ id: "m1", tipe: "FDM" as const, gramasi: "50", ...over });
const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", durasiJam: "3", materials: [mat()], ...over });
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
    expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ gramasi: "70" });
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
    render(<PlateInput plates={[row({ materials: [mat({ gramasi: "50" })], durasiJam: "3" }), row({ id: "p2", materials: [mat({ id: "m2", gramasi: "30" })], durasiJam: "2" })]} batch="1" onPlatesChange={vi.fn()} onBatchChange={vi.fn()} locked={false} />);
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

  it("newPlateRow menghasilkan row 1 material kosong ber-id", () => {
    const r = newPlateRow();
    expect(r).toMatchObject({ nama: "", durasiJam: "" });
    expect(r.id).toBeTruthy();
    expect(r.materials).toHaveLength(1);
    expect(r.materials[0]).toMatchObject({ tipe: "FDM", gramasi: "" });
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

describe("PlateInput redesign", () => {
  const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", durasiJam: "3", materials: [mat()], ...over });
  const base = { plates: [row()], batch: "1", onPlatesChange: () => {}, onBatchChange: () => {} };
  it("unlocked → label kolom permanen tampil", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText("Metode cetak")).toBeTruthy();
    expect(screen.getByText("Berat filament")).toBeTruthy();
    expect(screen.getByText("Durasi cetak")).toBeTruthy();
  });
  it("unlocked → 'Hasil sekali cetak' menggantikan 'Batch'", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText(/Hasil sekali cetak/)).toBeTruthy();
    expect(screen.queryByText(/^Batch/)).toBeNull();
  });
});

describe("1b-6a multi-material di plate", () => {
  const mat = (over = {}) => ({ id: "m1", tipe: "FDM" as const, gramasi: "50", ...over });
  const row = (over = {}): PlateRow => ({ id: "p1", nama: "", durasiJam: "3", materials: [mat()], ...over });
  const fil = [
    { id: "fil-a", brand: "eSUN", material: "PLA+", tipe: "FDM" as const, warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300, jualPerGram: 900 },
  ];

  it("tombol Multi-material menambah material ke-2", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    render(<PlateInput locked={false} plates={[row()]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /multi-material/i }));
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(2);
  });

  it("hapus material ke-2 kembali single", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2", gramasi: "20" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /hapus material/i })[1]);
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(1);
  });

  it("pilih filament dari katalog mengisi filamentId + tipe", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    const selects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).name === "filament" || el.getAttribute("aria-label") === "Pilih filament");
    await user.selectOptions(selects[0], "fil-a");
    expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ filamentId: "fil-a", tipe: "FDM" });
  });
});
