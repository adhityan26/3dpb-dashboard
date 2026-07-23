// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalcSection } from "./CalcSection";

describe("CalcSection", () => {
  it("render nomor, judul, subtotal, dan body", () => {
    render(<CalcSection n={1} title="Produksi" subtotal={29370}><p>isi</p></CalcSection>);
    expect(screen.getByText(/Produksi/)).toBeTruthy();
    expect(screen.getByText(/Rp29\.370/)).toBeTruthy();
    expect(screen.getByText("isi")).toBeTruthy();
  });
  it("collapse menyembunyikan body & menampilkan ringkasan", () => {
    render(<CalcSection n={2} title="Komponen" summary="1 item · Rp900"><p>rahasia</p></CalcSection>);
    fireEvent.click(screen.getByRole("button", { name: /Komponen/ }));
    expect(screen.queryByText("rahasia")).toBeNull();
    expect(screen.getByText(/1 item · Rp900/)).toBeTruthy();
  });
});
