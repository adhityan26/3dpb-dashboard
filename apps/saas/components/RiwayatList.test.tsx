// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RiwayatList } from "./RiwayatList";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

vi.mock("@/lib/store/kalkulasi-history", () => ({
  listKalkulasi: vi.fn(async () => []),
  deleteKalkulasi: vi.fn(async () => {}),
  putKalkulasi: vi.fn(async () => {}),
}));
import { listKalkulasi, deleteKalkulasi, putKalkulasi } from "@/lib/store/kalkulasi-history";

vi.mock("@/lib/store/local-settings", () => ({
  loadSettings: vi.fn(async () => ({})),
}));
import { loadSettings } from "@/lib/store/local-settings";

const REC = {
  id: "k1", userId: "u1", nama: "Vas bunga",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  input: {
    plates: [{ id: "p1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }],
    batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
  },
  snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 25000, status: "AMAN", strategi: {} },
};

beforeEach(() => {
  (listKalkulasi as any).mockReset().mockResolvedValue([]);
  (deleteKalkulasi as any).mockReset().mockResolvedValue(undefined);
  (putKalkulasi as any).mockReset().mockResolvedValue(undefined);
  (loadSettings as any).mockReset().mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
});

describe("RiwayatList", () => {
  it("kosong → pesan + tombol Hitung", async () => {
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText(/Belum ada riwayat/)).toBeTruthy());
    expect(screen.getByText("Hitung")).toBeTruthy();
  });

  it("ada records → tampil nama & harga", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    expect(screen.getByText(/25\.000/)).toBeTruthy();
  });

  it("klik baris → link ke /kalkulator/[id]", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    const link = screen.getByText("Vas bunga").closest("a");
    expect(link?.getAttribute("href")).toBe("/kalkulator/k1");
  });

  it("klik Hapus → confirm dulu, batal kalau confirm() false", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => false);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hapus"));
    expect(deleteKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hapus → confirm true → deleteKalkulasi + refresh list", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hapus"));
    await waitFor(() => expect(deleteKalkulasi).toHaveBeenCalledWith("u1", "k1"));
    expect(listKalkulasi).toHaveBeenCalledTimes(2);
  });

  it("klik '🔄 Refresh' → listKalkulasi terpanggil lagi", async () => {
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText(/Refresh/));
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(2));
  });

  it("tetap menampilkan 'Memuat riwayat' sampai settings selesai dimuat (bukan cuma records)", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    let resolveSettings: (s: any) => void;
    (loadSettings as any).mockReset().mockImplementation(
      () => new Promise((resolve) => { resolveSettings = resolve; })
    );
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalled());
    // records sudah selesai load, tapi settings belum — masih harus loading
    expect(screen.getByText(/Memuat riwayat/)).toBeTruthy();
    expect(screen.queryByText("Vas bunga")).toBeNull();
    resolveSettings!(DEFAULT_LOCAL_SETTINGS);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
  });
});

describe("RiwayatList: Duplikat & Hitung ulang", () => {
  it("klik Duplikat → putKalkulasi id baru + nama (salinan), list refresh, tak ada navigasi", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    (listKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Duplikat"));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    const saved = (putKalkulasi as any).mock.calls[0][0];
    expect(saved.id).not.toBe("k1");
    expect(saved.nama).toBe("Vas bunga (salinan)");
    expect(saved.snapshot.rekomendasi).toBe(87930);
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(1));
  });

  it("input plate tak valid → pesan error, putKalkulasi TIDAK dipanggil", async () => {
    const rusak = { ...REC, input: { ...REC.input, plates: [] } };
    (listKalkulasi as any).mockResolvedValue([rusak]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Duplikat"));
    await waitFor(() => expect(screen.getByText(/Gagal duplikat/)).toBeTruthy());
    expect(putKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hitung ulang, harga beda → confirm tampil dgn harga lama+baru+selisih, OK → putKalkulasi id sama", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect((putKalkulasi as any).mock.calls[0][0].id).toBe("k1");
    expect((putKalkulasi as any).mock.calls[0][0].snapshot.rekomendasi).toBe(87930);
    expect(window.confirm).toHaveBeenCalledWith(
      'Perbarui harga "Vas bunga"?\nRp25.000 → Rp87.930 (+Rp62.930)'
    );
  });

  it("klik Hitung ulang, confirm Cancel → putKalkulasi TIDAK dipanggil, record tak berubah", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => false);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    expect(putKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hitung ulang, harga SAMA → tak ada confirm, pesan 'Tidak ada perubahan', putKalkulasi TIDAK dipanggil", async () => {
    const sama = { ...REC, snapshot: { ...REC.snapshot, rekomendasi: 87930 } };
    (listKalkulasi as any).mockResolvedValue([sama]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/)).toBeTruthy());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(putKalkulasi).not.toHaveBeenCalled();
  });

  it("Duplikat: putKalkulasi ditolak → pesan error, list tak di-refresh", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear().mockRejectedValueOnce(new Error("gagal"));
    (listKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Duplikat"));
    await waitFor(() => expect(screen.getByText(/Gagal duplikat — coba lagi/)).toBeTruthy());
    expect(listKalkulasi).not.toHaveBeenCalled();
  });

  it("Hitung ulang: putKalkulasi ditolak → pesan error, list tak di-refresh", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear().mockRejectedValueOnce(new Error("gagal"));
    (listKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    await waitFor(() => expect(screen.getByText(/Gagal hitung ulang — coba lagi/)).toBeTruthy());
    expect(listKalkulasi).not.toHaveBeenCalled();
  });
});
