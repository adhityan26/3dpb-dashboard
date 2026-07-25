// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RiwayatList } from "./RiwayatList";

vi.mock("@/lib/store/kalkulasi-history", () => ({
  listKalkulasi: vi.fn(async () => []),
  deleteKalkulasi: vi.fn(async () => {}),
}));
import { listKalkulasi, deleteKalkulasi } from "@/lib/store/kalkulasi-history";

const REC = {
  id: "k1", userId: "u1", nama: "Vas bunga",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  input: { plates: [], batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B" },
  snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 25000, status: "AMAN", strategi: {} },
};

beforeEach(() => {
  (listKalkulasi as any).mockReset().mockResolvedValue([]);
  (deleteKalkulasi as any).mockReset().mockResolvedValue(undefined);
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
});
