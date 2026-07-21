// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModulMenu } from "./ModulMenu";

describe("ModulMenu", () => {
  it("Kalkulator (sudah jadi) dilinkkan", () => {
    render(<ModulMenu />);
    expect(screen.getByText("Kalkulator").closest("a")?.getAttribute("href")).toBe("/");
  });

  it("modul belum jadi TIDAK dilinkkan & diberi badge 'segera'", () => {
    render(<ModulMenu />);
    for (const label of ["Invoice", "PO", "Filamen"]) {
      const el = screen.getByText(new RegExp(`^${label}$`));
      expect(el.closest("a")).toBeNull(); // tak ada nav buntu
    }
    expect(screen.getAllByText("segera").length).toBe(4);
  });

  it("printer monitor ditandai add-on (dijual terpisah)", () => {
    render(<ModulMenu />);
    expect(screen.getByText(/add-on/)).toBeTruthy();
    expect(screen.getByText(/Printer monitor/).closest("a")).toBeNull();
  });

  it("menandai halaman yang sedang dibuka", () => {
    render(<ModulMenu current="kalkulator" />);
    expect(screen.getByLabelText("halaman ini")).toBeTruthy();
  });
});
