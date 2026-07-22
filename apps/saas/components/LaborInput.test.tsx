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
  it("ganti ke Biaya flat → sembunyikan jam/tarif, tampil biaya", () => {
    const onC = vi.fn();
    const { rerender } = render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", jam: 0.5, ratePerJam: 35000 }]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Biaya flat/ }));
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
