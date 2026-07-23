// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LaborInput } from "./LaborInput";

const presets = [{ id: "l1", nama: "Finishing standar", items: [{ nama: "Assembly", jam: 0.5, ratePerJam: 35000 }] }];

describe("LaborInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<LaborInput locked presets={presets} labor={[]} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("klik preset → append item bundle", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Finishing standar/ }));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "Assembly", jam: 0.5, ratePerJam: 35000 });
  });
  it("baris metode waktu → tampil jam & tarif, sembunyikan flat", () => {
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", jam: 0.5, ratePerJam: 35000 }]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("jam")).toBeTruthy();
    expect(screen.getByPlaceholderText("tarif")).toBeTruthy();
    expect(screen.queryByPlaceholderText("biaya")).toBeNull();
  });
  it("chip metode → ganti ke flat: sembunyikan jam/tarif, tampil biaya", () => {
    const onC = vi.fn();
    const { rerender } = render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", jam: 0.5, ratePerJam: 35000 }]} onChange={onC} />);
    // Baris waktu → chip menampilkan "⏱ Per jam"; klik chip untuk ganti ke tetap.
    fireEvent.click(screen.getByRole("button", { name: /Ganti cara hitung/ }));
    // jam & rate dikosongkan
    expect(onC.mock.calls[0][0][0]).toMatchObject({ jam: undefined, ratePerJam: undefined });
    rerender(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", flat: 0 }]} onChange={onC} />);
    expect(screen.getByPlaceholderText("biaya")).toBeTruthy();
    expect(screen.queryByPlaceholderText("jam")).toBeNull();
  });
  it("Tambah pekerjaan custom → baris kosong (metode waktu default)", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[]} onChange={onC} />);
    fireEvent.click(screen.getByText(/Tambah pekerjaan custom/));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "" });
    expect(onC.mock.calls[0][0][0].id).toBeTruthy();
  });
});

const jobs = [
  { id: "j1", nama: "Painting", ratePerJam: 75000 },
  { id: "j2", nama: "Packing", flat: 3000 },
];
const withCat = { jobs, onAddJob: vi.fn() };

describe("LaborInput katalog", () => {
  it("datalist berisi nama job dari katalog", () => {
    const { container } = render(<LaborInput locked={false} presets={presets} labor={[]} onChange={() => {}} {...withCat} />);
    const opts = Array.from(container.querySelectorAll("datalist option")).map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(expect.arrayContaining(["Painting", "Packing"]));
  });
  it("ketik nama cocok katalog (baris kosong) → auto-isi ratePerJam", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "" }]} onChange={onC} {...withCat} />);
    fireEvent.change(screen.getByPlaceholderText(/Nama pekerjaan/), { target: { value: "Painting" } });
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ nama: "Painting", ratePerJam: 75000 });
  });
  it("nama cocok tapi baris SUDAH ada tarif → tidak menimpa", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "", jam: 1, ratePerJam: 10000 }]} onChange={onC} {...withCat} />);
    fireEvent.change(screen.getByPlaceholderText(/Nama pekerjaan/), { target: { value: "Painting" } });
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ nama: "Painting", ratePerJam: 10000 });
  });
  it("blur nama BARU (tak di katalog, baris kosong) → dialog muncul; Simpan panggil onAddJob + isi baris", () => {
    const onC = vi.fn(); const onAdd = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Coating" }]} onChange={onC} jobs={jobs} onAddJob={onAdd} />);
    fireEvent.blur(screen.getByDisplayValue("Coating"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Tarif/i), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan & pakai/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ nama: "Coating", ratePerJam: 50000 }));
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ ratePerJam: 50000 });
  });
  it("blur nama baru → 'Nanti' menutup dialog tanpa onAddJob", () => {
    const onAdd = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Coating" }]} onChange={() => {}} jobs={jobs} onAddJob={onAdd} />);
    fireEvent.blur(screen.getByDisplayValue("Coating"));
    fireEvent.click(screen.getByRole("button", { name: /Nanti/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
