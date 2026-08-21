// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";

vi.mock("@/lib/kalkulator/import-3mf", () => ({ importSlicerFile: vi.fn() }));

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
  it("unlocked → label eyebrow Durasi & Material tampil", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText("Durasi")).toBeTruthy();
    expect(screen.getByText("Material & warna")).toBeTruthy();
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

  it("toggle Multi menambah material ke-2", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    render(<PlateInput locked={false} plates={[row()]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getByTitle(/tambah material lain/i));
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(2);
  });

  it("toggle Multi (✕ Multi) pas >1 material langsung ciutkan ke 1, bersihkan filamentId/warnaHex", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [
      mat({ filamentId: "fil-a", warnaHex: "#f5f5f5" }),
      mat({ id: "m2", gramasi: "20" }),
      mat({ id: "m3", gramasi: "5" }),
    ] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getByTitle(/kembali ke 1 material/i));
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(1);
    expect(onP.mock.calls[0][0][0].materials[0].filamentId).toBeUndefined();
    expect(onP.mock.calls[0][0][0].materials[0].warnaHex).toBeUndefined();
  });

  it("hapus material ke-2 kembali single", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2", gramasi: "20" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /hapus material/i })[1]);
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(1);
  });

  it("collapse ke single membersihkan filamentId/warnaHex survivor (harga ikut tipe, bukan katalog tersembunyi)", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [
      mat({ filamentId: "fil-a", warnaHex: "#f5f5f5" }),
      mat({ id: "m2", gramasi: "20" }),
    ] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    // hapus material ke-2 → tersisa 1 → survivor harus bersih dari filamentId
    await user.click(screen.getAllByRole("button", { name: /hapus material/i })[1]);
    const survivor = onP.mock.calls[0][0][0].materials[0];
    expect(survivor.filamentId).toBeUndefined();
    expect(survivor.warnaHex).toBeUndefined();
    expect(survivor.tipe).toBe("FDM"); // tipe survivor dipertahankan
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

  it("ketik berat multi-digit di baris material tetap fokus (baris tak remount tiap ketik)", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [plates, setPlates] = useState<PlateRow[]>([
        row({ materials: [mat({ gramasi: "" }), mat({ id: "m2", gramasi: "" })] }),
      ]);
      return <PlateInput locked={false} plates={plates} batch="1" filaments={fil} onPlatesChange={setPlates} onBatchChange={() => {}} />;
    }
    render(<Harness />);
    const target = screen.getAllByPlaceholderText("berat")[0] as HTMLInputElement;
    target.focus();
    await user.type(target, "123");
    // Kalau baris material remount tiap ketik, node lama lepas fokus & value cuma "1".
    expect(target.value).toBe("123");
    expect(document.activeElement).toBe(target);
  });
});

describe("1b-6b import file slicer (multi-file append)", () => {
  const mockImport = importSlicerFile as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => { mockImport.mockReset(); });

  const draftA = {
    nama: "PrintA", batch: 2, isSliced: true, warnings: ["Filament X belum ada di katalog — pakai tarif default"],
    plates: [{ nama: "Plate A1", durasiJam: 1, materials: [{ tipe: "FDM", gramasi: 10 }] }],
  };
  const draftB = {
    nama: "PrintB", batch: 3, isSliced: true, warnings: [],
    plates: [
      { nama: "Plate B1", durasiJam: 2, materials: [{ tipe: "FDM", gramasi: 20 }] },
      { nama: "Plate B2", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 30 }] },
    ],
  };
  const pristinePlates = [{ id: "p1", nama: "", durasiJam: "", materials: [{ id: "m1", tipe: "FDM" as const, gramasi: "" }] }];
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("tombol import muncul untuk Pro, tidak untuk Free", () => {
    const { rerender } = render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText(/Import file slicer/)).toBeTruthy();
    rerender(<PlateInput {...base} locked={true} />);
    expect(screen.queryByText(/Import file slicer/)).toBeNull();
  });

  it("input file punya atribut multiple", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(fileInput().multiple).toBe(true);
  });

  it("state pristine → plate kosong diganti hasil import + batch di-set dari file pertama", async () => {
    mockImport.mockResolvedValue(draftA);
    const onP = vi.fn();
    const onB = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} onBatchChange={onB} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(1);
    expect(onP.mock.calls[0][0][0]).toMatchObject({ nama: "Plate A1", durasiJam: "1" });
    expect(onB).toHaveBeenCalledWith("2");
    expect(await screen.findByText(/Filament X belum ada di katalog/)).toBeTruthy();
  });

  it("state terisi → hasil import di-APPEND, batch TIDAK diubah", async () => {
    mockImport.mockResolvedValue(draftB);
    const onP = vi.fn();
    const onB = vi.fn();
    // base.plates = 1 plate terisi (durasiJam "3", gramasi "50")
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} onBatchChange={onB} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "b.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(3); // 1 lama + 2 baru
    expect(onP.mock.calls[0][0][1]).toMatchObject({ nama: "Plate B1" });
    expect(onP.mock.calls[0][0][2]).toMatchObject({ nama: "Plate B2" });
    expect(onB).not.toHaveBeenCalled();
  });

  it("multi-select 2 file sekaligus → semua plate masuk berurutan", async () => {
    mockImport.mockResolvedValueOnce(draftA).mockResolvedValueOnce(draftB);
    const onP = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf"), new File(["d"], "b.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(mockImport).toHaveBeenCalledTimes(2);
    expect(onP.mock.calls[0][0].map((p: { nama: string }) => p.nama)).toEqual(["Plate A1", "Plate B1", "Plate B2"]);
  });

  it("1 file gagal + 1 file valid → yang valid tetap masuk, error menyebut nama file gagal", async () => {
    mockImport.mockResolvedValueOnce(null).mockResolvedValueOnce(draftB);
    const onP = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "bad.zip"), new File(["d"], "b.gcode.3mf")] } });
    expect(await screen.findByText(/bad\.zip/)).toBeTruthy();
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(2);
  });

  it("semua file tidak dikenali → error inline tampil, plates tak berubah", async () => {
    mockImport.mockResolvedValue(null);
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "bad.zip")] } });
    expect(await screen.findByText(/tidak dikenali/)).toBeTruthy();
    expect(onP).not.toHaveBeenCalled();
  });

  it("warnings duplikat lintas file di-dedupe", async () => {
    mockImport.mockResolvedValueOnce(draftA).mockResolvedValueOnce({ ...draftB, warnings: draftA.warnings });
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={vi.fn()} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf"), new File(["d"], "b.gcode.3mf")] } });
    const warns = await screen.findAllByText(/Filament X belum ada di katalog/);
    expect(warns).toHaveLength(1);
  });
});

describe("durasi format H:MM & native color input (polish pasca-1b-6b)", () => {
  it("ketik format H:MM lalu blur → dikonversi ke desimal jam", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    const input = screen.getByPlaceholderText("jam atau H:MM") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1:45" } });
    fireEvent.blur(input);
    expect(onP.mock.calls[0][0][0]).toMatchObject({ durasiJam: "1.75" });
  });

  it("angka desimal biasa tetap jalan seperti sebelumnya", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    const input = screen.getByPlaceholderText("jam atau H:MM") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.blur(input);
    expect(onP.mock.calls[0][0][0]).toMatchObject({ durasiJam: "2.5" });
  });

  it("ketik tanpa blur belum commit ke onPlatesChange (baru commit saat blur)", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    const input = screen.getByPlaceholderText("jam atau H:MM") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1:4" } });
    expect(onP).not.toHaveBeenCalled();
  });

  it("input warna native ada & ganti warna update warnaHex material", () => {
    const fil = [{ id: "fil-a", brand: "eSUN", material: "PLA+", tipe: "FDM" as const, warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300, jualPerGram: 900 }];
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2", gramasi: "20" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    const colorInput = screen.getAllByLabelText("Pilih warna")[0] as HTMLInputElement;
    expect(colorInput.type).toBe("color");
    fireEvent.change(colorInput, { target: { value: "#ff00ff" } });
    expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ warnaHex: "#ff00ff" });
  });

  it("hint format jam-menit tampil di kanan input durasi", () => {
    render(<PlateInput {...base} locked={false} plates={[row({ durasiJam: "8.57" })]} />);
    expect(screen.getByText("8j 34m")).toBeTruthy();
  });

  it("durasi 0/kosong tak menampilkan hint", () => {
    render(<PlateInput {...base} locked={false} plates={[row({ durasiJam: "" })]} />);
    expect(screen.queryByText(/^\d+j/)).toBeNull();
  });
});

describe("material selalu tampil sebagai kartu + toggle Multi per plate (polish dashboard-style)", () => {
  it("single-material tetap render kartu filament (bukan cuma tipe+berat flat)", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByLabelText("Pilih filament")).toBeTruthy();
    expect(screen.getByLabelText("Pilih warna")).toBeTruthy();
    // 1 material → tak ada tombol hapus per-baris (toggle Multi yang urus jumlahnya)
    expect(screen.queryByLabelText(/Hapus material/)).toBeNull();
  });

  it("multi-plate → tiap plate/card dapat toggle Multi sendiri-sendiri", () => {
    render(<PlateInput {...base} locked={false} plates={[row(), row({ id: "p2" })]} />);
    expect(screen.getAllByTitle(/tambah material lain|kembali ke 1 material/i)).toHaveLength(2);
  });
});
