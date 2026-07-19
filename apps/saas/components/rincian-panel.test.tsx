// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RincianPanel } from "./RincianPanel";

describe("RincianPanel", () => {
  it("render baris breakdown", () => {
    render(<RincianPanel rincian={{ produksi: 40000, komponen: 900, packing: 2500, labor: 202500, biayaModal: 245900, hargaJualMinimum: 260000, rekomendasi: 312000 }} />);
    expect(screen.getByText(/Produksi/)).toBeTruthy();
    expect(screen.getByText(/Biaya modal/)).toBeTruthy();
    expect(screen.getByText("Rp202.500")).toBeTruthy();
  });
});
