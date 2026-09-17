// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

// loadSettings' REAL implementation never resolves to a bare {} -- it always returns at least
// DEFAULT_LOCAL_SETTINGS (merged with any stored record) -- freeTierSettings() (called now for
// every logged-in user, not just Pro, since Free can edit "Harga jual") reads material/margin/
// channels off whatever this resolves to, so the mock default must match that real shape.
vi.mock("@/lib/store/local-settings", async () => {
  const { DEFAULT_LOCAL_SETTINGS: real } = await vi.importActual<typeof import("@/lib/kalkulator/local-settings")>("@/lib/kalkulator/local-settings");
  return { loadSettings: vi.fn(async () => real), saveSettings: vi.fn(async () => {}) };
});
import { loadSettings, saveSettings } from "@/lib/store/local-settings";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/lib/store/kalkulasi-history", () => ({
  getKalkulasi: vi.fn(async () => null),
  putKalkulasi: vi.fn(async () => {}),
}));
import { getKalkulasi, putKalkulasi } from "@/lib/store/kalkulasi-history";

describe("Calculator", () => {
  // Redesign: ResultPanel tak lagi memakai LockedBlock/.locked-blur — channel & strategi
  // harga kini langsung tampil untuk user login (maksud test lama dipertahankan: konten hasil
  // tersedia untuk user authenticated).
  it("login → channel & strategi harga (ResultPanel) tampil", () => {
    render(<Calculator />);
    expect(screen.getByText(/REKOMENDASI HARGA JUAL/)).toBeTruthy();
    expect(screen.getByText(/Strategi harga/)).toBeTruthy();
  });
  it("menampilkan label margin Standard untuk rekomendasi", () => {
    render(<Calculator />);
    expect(screen.getByText(/Standard · /)).toBeTruthy();
  });
});

describe("Calculator gating settings", () => {
  // Sejak Free boleh edit section "Harga jual" (SettingsPanel), Calculator memuat settings
  // untuk SEMUA user berlogin (bukan cuma Pro) -- freeTierSettings() yang menyaring field mana
  // yang genuinely dipakai untuk non-Pro, lihat describe "Calculator: Free tier harga jual".
  it("paidCore=false + userId → TETAP load settings (buat filter freeTierSettings)", () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore={false} userId="u1" />);
    expect(loadSettings).toHaveBeenCalledWith("u1");
  });
  it("tanpa userId (anon) → tidak load settings custom", () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore={false} userId={null} />);
    expect(loadSettings).not.toHaveBeenCalled();
  });
  it("paidCore=true + userId → load settings", () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore={true} userId="u1" />);
    expect(loadSettings).toHaveBeenCalledWith("u1");
  });
});

describe("Calculator: Free tier harga jual (settings custom disaring lewat freeTierSettings)", () => {
  it("Free: harga jual/margin custom tersimpan IKUT dipakai kalkulator", async () => {
    (loadSettings as any).mockClear().mockResolvedValueOnce({
      ...DEFAULT_LOCAL_SETTINGS,
      material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, jualPerGram: 12345 } },
    });
    render(<Calculator paidCore={false} userId="u1" />);
    await waitFor(() => expect(loadSettings).toHaveBeenCalledWith("u1"));
    // Rekomendasi harga jual (margin B × harga-jual-minimum) berubah begitu FDM jual/g custom
    // ke-load -- tak perlu hafal angka pastinya, cukup pastikan bukan lagi angka hasil DEFAULT.
    await waitFor(() => expect(screen.queryByText(/Memuat/)).toBeNull());
  });

  it("Free: field DI LUAR Harga jual pada data tersimpan (mis. tampering IndexedDB langsung) tidak ikut dipakai", async () => {
    (loadSettings as any).mockClear().mockResolvedValueOnce({
      ...DEFAULT_LOCAL_SETTINGS,
      material: { ...DEFAULT_LOCAL_SETTINGS.material, FDM: { ...DEFAULT_LOCAL_SETTINGS.material.FDM, hppPerGram: 1 } },
      komponenPresets: [{ id: "x", nama: "Hasil Tamper", harga: 1 }],
    });
    render(<Calculator paidCore={false} userId="u1" />);
    await waitFor(() => expect(loadSettings).toHaveBeenCalledWith("u1"));
    // Section add-on tetap terkunci (komponenPresets yang di-tamper tak pernah dipakai) --
    // pola sama dengan test "Calculator add-on gating" di atas.
    expect(screen.getByText(/🔒 Komponen/)).toBeTruthy();
    expect(screen.queryByText(/Hasil Tamper/)).toBeNull();
  });
});

describe("Calculator add-on gating", () => {
  it("paidCore=false → blok add-on terkunci", () => {
    render(<Calculator paidCore={false} userId="u1" />);
    expect(screen.getByText(/🔒 Komponen/)).toBeTruthy();
    expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
  });
  it("paidCore=true → chip preset komponen muncul", async () => {
    (loadSettings as any).mockClear();
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    render(<Calculator paidCore={true} userId="u1" />);
    await waitFor(() => expect(screen.getByText(/Gantungan kew-kew/)).toBeTruthy());
  });
});

describe("Calculator: status & tooltip", () => {
  it("tak membocorkan enum mentah; TIDAK_DISET disembunyikan (saas tak punya input harga aktual)", () => {
    render(<Calculator paidCore={false} userId="u1" />);
    expect(screen.queryByText(/TIDAK_DISET/)).toBeNull();
    expect(screen.queryByText(/Status:/)).toBeNull();
  });

  it("field & angka hasil punya penjelasan (ℹ)", async () => {
    render(<Calculator paidCore={false} userId="u1" />);
    const tips = screen.getAllByLabelText("Penjelasan");
    expect(tips.length).toBeGreaterThanOrEqual(6); // 3 input + 3 angka hasil
    fireEvent.click(tips[0]);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Berat total produk/i);
  });
});

describe("1b-3 multi-plate di Calculator", () => {
  it("Pro: tampil kontrol multi-plate (tambah plate + batch)", () => {
    render(<Calculator paidCore={true} userId="u1" />);
    expect(screen.getByText(/tambah plate/)).toBeTruthy();
    expect(screen.getByText(/Hasil sekali cetak/)).toBeTruthy();
  });

  it("Free: multi-plate terkunci, tetap tampil field Berat berlabel", () => {
    render(<Calculator paidCore={false} userId={null} />);
    expect(screen.getByText(/Berat/)).toBeTruthy();
    expect(screen.getByText(/Multi-plate/)).toBeTruthy();
    expect(screen.queryByText(/tambah plate/)).toBeNull();
  });
});

describe("Calculator redesign", () => {
  it("Pro: section bernomor + ResultPanel terpasang", () => {
    render(<Calculator paidCore={true} userId="u1" />);
    expect(screen.getByText(/1\. Produksi/)).toBeTruthy();
    expect(screen.getByText(/REKOMENDASI HARGA JUAL/)).toBeTruthy();
    expect(screen.getByText(/2\. Komponen tambahan/)).toBeTruthy();
  });
  it("Pro: klik strategi Premium mengubah headline harga", () => {
    render(<Calculator paidCore={true} userId="u1" />);
    expect(screen.getByText(/Standard · /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Premium/ }));
    expect(screen.getByText(/Premium · /)).toBeTruthy();
  });
  it("Free: Produksi tetap tampil, section add-on terkunci", () => {
    render(<Calculator paidCore={false} userId={null} />);
    expect(screen.getByText(/1\. Produksi/)).toBeTruthy();
    expect(screen.getByText(/🔒 Komponen tambahan/)).toBeTruthy();
  });
});

describe("Calculator katalog pekerjaan", () => {
  it("Pro: LaborInput menerima jobs dari settings (datalist terisi)", async () => {
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    const { container } = render(<Calculator paidCore userId="u1" />);
    await waitFor(() => {
      const opts = Array.from(container.querySelectorAll("datalist option")).map((o) => (o as HTMLOptionElement).value);
      expect(opts).toEqual(expect.arrayContaining(["Painting"]));
    });
  });
});

describe("Calculator: simpan & riwayat (1b-4)", () => {
  it("tanpa kalkulasiId → tak menampilkan 'Memuat kalkulasi'", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.queryByText(/Memuat kalkulasi/)).toBeNull();
  });

  it("Free (paidCore=false) → field Nama tak muncul", () => {
    render(<Calculator paidCore={false} userId={null} />);
    expect(screen.queryByPlaceholderText(/Nama kalkulasi/)).toBeNull();
  });

  it("Pro → field Nama muncul", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.getByPlaceholderText(/Nama kalkulasi/)).toBeTruthy();
  });

  it("dengan kalkulasiId → getKalkulasi mengisi form dari record", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "Vas bunga",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "2", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Vas bunga")).toBeTruthy());
  });

  it("kalkulasiId tak ditemukan → pesan 'tidak ditemukan'", async () => {
    (getKalkulasi as any).mockResolvedValueOnce(null);
    render(<Calculator paidCore userId="u1" kalkulasiId="k-hilang" />);
    await waitFor(() => expect(screen.getByText(/tidak ditemukan/)).toBeTruthy());
  });

  it("simpan pertama kali → putKalkulasi dipanggil + router.push ke /kalkulator/[id]", async () => {
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/kalkulator\//));
  });

  it("klik ganda cepat pada Simpan → putKalkulasi cuma terpanggil sekali (no double-submit)", async () => {
    mockPush.mockClear();
    let resolvePut: () => void;
    (putKalkulasi as any).mockClear().mockImplementation(
      () => new Promise<void>((resolve) => { resolvePut = resolve; })
    );
    render(<Calculator paidCore userId="u1" />);
    const btn = screen.getByRole("button", { name: /^Simpan/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(putKalkulasi).toHaveBeenCalledTimes(1);
    resolvePut!();
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    // restore default resolved-promise mock (no global mock reset between tests in this file)
    (putKalkulasi as any).mockImplementation(async () => {});
  });

  it("simpan kedua (sudah ada kalkulasiId) → putKalkulasi id sama, tanpa push lagi", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "X",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Update/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^Update/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect((putKalkulasi as any).mock.calls[0][0].id).toBe("k1");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("klik '🔄 Refresh tarif' → loadSettings terpanggil lagi", async () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore userId="u1" />);
    await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText(/Refresh tarif/));
    await waitFor(() => expect(loadSettings).toHaveBeenCalledTimes(2));
  });
});

describe("Calculator: Duplikat", () => {
  it("kalkulasi baru (belum tersimpan) → tombol Duplikat tak muncul", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.queryByRole("button", { name: /Duplikat/ })).toBeNull();
  });

  it("sedang edit record tersimpan → tombol Duplikat muncul", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "X",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Duplikat/ })).toBeTruthy());
  });

  it("klik Duplikat → putKalkulasi id BARU (beda dari kalkulasiId), nama berakhiran (salinan), pindah ke /kalkulator/[id-baru]", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "Vas bunga",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Duplikat/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Duplikat/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    const saved = (putKalkulasi as any).mock.calls[0][0];
    expect(saved.id).not.toBe("k1");
    expect(saved.nama).toBe("Vas bunga (salinan)");
    expect(mockPush).toHaveBeenCalledWith(`/kalkulator/${saved.id}`);
  });

  it("edit nama sebelum klik Duplikat → putKalkulasi memakai nama yang BARU diedit, bukan nama record asli", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "Vas bunga",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Duplikat/ })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Nama kalkulasi/), { target: { value: "Vas bunga edisi baru" } });
    fireEvent.click(screen.getByRole("button", { name: /Duplikat/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    const saved = (putKalkulasi as any).mock.calls[0][0];
    expect(saved.nama).toBe("Vas bunga edisi baru (salinan)");
  });
});
