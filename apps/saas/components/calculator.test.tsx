// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

vi.mock("@/lib/store/local-settings", () => ({ loadSettings: vi.fn(async () => ({})) }));
import { loadSettings } from "@/lib/store/local-settings";

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
  it("paidCore=false → tidak load settings custom", () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore={false} userId="u1" />);
    expect(loadSettings).not.toHaveBeenCalled();
  });
  it("paidCore=true + userId → load settings", () => {
    (loadSettings as any).mockClear();
    render(<Calculator paidCore={true} userId="u1" />);
    expect(loadSettings).toHaveBeenCalledWith("u1");
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
