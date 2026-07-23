// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveMock = vi.fn();
const resetMock = vi.fn();
vi.mock("@/lib/store/local-settings", async () => {
  const actual = await vi.importActual<any>("@/lib/kalkulator/local-settings");
  return {
    loadSettings: vi.fn(async () => actual.DEFAULT_LOCAL_SETTINGS),
    saveSettings: (...a: unknown[]) => saveMock(...a),
    resetSettings: (...a: unknown[]) => resetMock(...a)
  };
});
import { SettingsPanel } from "@/components/SettingsPanel";
import { loadSettings } from "@/lib/store/local-settings";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

beforeEach(() => { saveMock.mockReset(); resetMock.mockReset(); saveMock.mockResolvedValue(undefined); window.localStorage.clear(); });

describe("SettingsPanel", () => {
  it("Free (editable=false) → input disabled + CTA Beli, tak ada tombol Simpan", () => {
    render(<SettingsPanel editable={false} userId="u1" />);
    expect((screen.getByLabelText(/FDM harga modal/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Buka semua ini di Pro/i)).toBeTruthy();
    expect(screen.queryByText("Simpan")).toBeNull();
  });
  it("Beli (editable=true) → Simpan panggil saveSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("u1", expect.any(Object)));
  });
  it("Beli → Reset panggil resetSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Reset ke default"));
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("u1"));
  });
});

describe("SettingsPanel 1b-2 komponen/packing/tampilan", () => {
  it("Free → grup Komponen & Packing terkunci; Tampilan toggle TETAP enabled", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect((screen.getByDisplayValue("Gantungan kew-kew") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByDisplayValue("Packing S") as HTMLInputElement).disabled).toBe(true);
    const toggle = screen.getByLabelText(/rincian perhitungan/i) as HTMLInputElement;
    expect(toggle.disabled).toBe(false);
  });
  it("Tampilan toggle persist ke localStorage segera", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    // Default rincian tampil (checked); satu klik mematikannya → "0".
    fireEvent.click(screen.getByLabelText(/rincian perhitungan/i));
    expect(window.localStorage.getItem("slizebiz-rincian")).toBe("0");
  });
  it("Beli → tambah packing (isi valid) lalu Simpan meneruskan packing baru", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    const addBtn = await screen.findByText(/Tambah packing/i);
    fireEvent.click(addBtn);
    // baris packing baru = input Nama & harga terakhir; isi valid dulu
    const names = screen.getAllByPlaceholderText("Nama");
    const newNameInput = names[names.length - 1] as HTMLInputElement;
    fireEvent.change(newNameInput, { target: { value: "Box Besar" } });
    // find spinbutton after the name input in the same flex row
    const container = newNameInput.closest(".flex");
    const spinbutton = container?.querySelector('input[type="number"]') as HTMLInputElement;
    if (spinbutton) fireEvent.change(spinbutton, { target: { value: "3000" } });
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0][1].packingPresets.length).toBe(5);
    expect(saveMock.mock.calls[0][1].packingPresets[4]).toMatchObject({ nama: "Box Besar", harga: 3000 });
  });
  it("Beli → preset invalid (kosong) → tak Simpan + hint", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    const addBtn = await screen.findByText(/Tambah komponen/i);
    fireEvent.click(addBtn); // preset komponen baru kosong (nama "", harga 0) → invalid
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(screen.getByText(/nama kosong|harga harus > 0/i)).toBeTruthy());
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel labor bundle", () => {
  it("Free → labor preset & item disabled", async () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect((screen.getByDisplayValue("Finishing Standar") as HTMLInputElement).disabled).toBe(true);
  });
  it("Beli → tambah item ke bundle lalu Simpan", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Finishing Ringan")).toBeTruthy());
    fireEvent.click(screen.getAllByText(/Tambah item/i)[0]);
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const lp = saveMock.mock.calls[0][1].laborPresets[0];
    expect(lp.items.length).toBe(4);
  });
});

describe("SettingsPanel struktur & tooltip", () => {
  it("punya 4 section dg judul + kalimat tujuan", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    for (const t of ["Biaya produksi", "Harga jual", "Tambahan", "Tampilan"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByText(/Berapa modal yang keluar/i)).toBeTruthy();
    expect(screen.getByText(/Dari modal, jadi berapa harga jualnya/i)).toBeTruthy();
  });

  it("field biaya & harga terpisah sesuai alur hitung", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    // modal/failure = biaya produksi; jual/margin = harga jual
    expect(screen.getByLabelText(/FDM harga modal\/g/i)).toBeTruthy();
    expect(screen.getByLabelText(/FDM harga jual\/g/i)).toBeTruthy();
    expect(screen.getByLabelText(/Fee Shopee/i)).toBeTruthy();
  });

  it("tooltip ℹ: tersembunyi, muncul saat diklik, hilang saat diklik lagi", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    const tips = screen.getAllByLabelText("Penjelasan");
    fireEvent.click(tips[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/filament FDM per gram/i);
    fireEvent.click(tips[0]);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Free: section berbayar terkunci, tapi Tampilan tetap bisa diubah", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect(screen.getAllByText(/Edit di Pro/i).length).toBeGreaterThanOrEqual(3);
    expect((screen.getByLabelText(/rincian perhitungan/i) as HTMLInputElement).disabled).toBe(false);
  });
});

describe("SettingsPanel daftar pekerjaan", () => {
  it("render job dari katalog + bisa tambah (Pro)", async () => {
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    render(<SettingsPanel editable={true} userId="u1" />);
    // nama "Painting" juga muncul di item preset labor (bundle), jadi cari spesifik
    // baris di section "Daftar pekerjaan" (placeholder "Nama pekerjaan").
    await waitFor(() => {
      const jobRows = screen.getAllByPlaceholderText("Nama pekerjaan") as HTMLInputElement[];
      expect(jobRows.some((el) => el.value === "Painting")).toBe(true);
    });
    expect(screen.getByText(/Daftar pekerjaan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tambah pekerjaan/ }));
    // baris kosong baru muncul (input nama tambahan)
    expect(screen.getAllByPlaceholderText("Nama pekerjaan").length).toBeGreaterThanOrEqual(1);
  });
});
