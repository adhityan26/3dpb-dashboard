// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PackingInput } from "./PackingInput";

const presets = [{ id: "p1", nama: "Packing S", harga: 1500 }, { id: "p2", nama: "Packing M", harga: 2500 }];

describe("PackingInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<PackingInput locked presets={presets} packing={undefined} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("pilih packing → onChange dgn nama+harga", () => {
    const onC = vi.fn();
    render(<PackingInput locked={false} presets={presets} packing={undefined} onChange={onC} />);
    fireEvent.click(screen.getByRole("radio", { name: /Packing S/ }));
    expect(onC).toHaveBeenCalledWith({ nama: "Packing S", harga: 1500 });
  });
  it("pilih 'Tanpa packing' → undefined", () => {
    const onC = vi.fn();
    render(<PackingInput locked={false} presets={presets} packing={{ nama: "Packing S", harga: 1500 }} onChange={onC} />);
    fireEvent.click(screen.getByRole("radio", { name: /Tanpa packing/ }));
    expect(onC).toHaveBeenCalledWith(undefined);
  });
  it("radio aktif tercermin (aria-checked)", () => {
    render(<PackingInput locked={false} presets={presets} packing={{ nama: "Packing S", harga: 1500 }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /Packing S/ }).getAttribute("aria-checked")).toBe("true");
  });
});
