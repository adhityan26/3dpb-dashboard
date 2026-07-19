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

beforeEach(() => { saveMock.mockReset(); resetMock.mockReset(); saveMock.mockResolvedValue(undefined); window.localStorage.clear(); });

describe("SettingsPanel", () => {
  it("Free (editable=false) → input disabled + CTA Beli, tak ada tombol Simpan", () => {
    render(<SettingsPanel editable={false} userId="u1" />);
    expect((screen.getByLabelText(/FDM harga modal/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Buka semua ini di Beli/i)).toBeTruthy();
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
    fireEvent.click(screen.getByLabelText(/rincian perhitungan/i));
    expect(window.localStorage.getItem("slizebiz-rincian")).toBe("1");
  });
  it("Beli → tambah packing (isi valid) lalu Simpan meneruskan packing baru", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    const addBtn = await screen.findByText(/Tambah packing/i);
    fireEvent.click(addBtn);
    // baris packing baru = input Nama & harga terakhir; isi valid dulu
    const names = screen.getAllByPlaceholderText("Nama");
    fireEvent.change(names[names.length - 1], { target: { value: "Box Besar" } });
    const nums = screen.getAllByRole("spinbutton");
    fireEvent.change(nums[nums.length - 1], { target: { value: "3000" } });
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
