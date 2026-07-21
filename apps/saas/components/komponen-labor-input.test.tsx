// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

const base = {
  settings: DEFAULT_LOCAL_SETTINGS, komponen: [], labor: [], packing: undefined,
  onKomponenChange: vi.fn(), onLaborChange: vi.fn(), onPackingChange: vi.fn(),
};

describe("KomponenLaborInput", () => {
  it("locked → 🔒 + CTA, tak ada chip preset", () => {
    render(<KomponenLaborInput {...base} locked={true} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
    expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
  });
  it("unlocked → chip komponen append 1 row", () => {
    const onK = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onKomponenChange={onK} />);
    fireEvent.click(screen.getByText(/Gantungan kew-kew/));
    expect(onK.mock.calls[0][0][0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900, qty: 1 });
  });
  it("unlocked → chip labor bundle append SEMUA item (Mask Medium = 3)", () => {
    const onL = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onLaborChange={onL} />);
    fireEvent.click(screen.getByText(/Mask Medium/));
    expect(onL.mock.calls[0][0]).toHaveLength(3);
    expect(onL.mock.calls[0][0][0]).toMatchObject({ nama: "Assembly", jam: 0.5, ratePerJam: 35000 });
  });
  it("unlocked → packing single-select set lalu clear", () => {
    const onP = vi.fn();
    const { rerender } = render(<KomponenLaborInput {...base} locked={false} onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: /Packing S/ }));
    expect(onP).toHaveBeenCalledWith({ nama: "Packing S", harga: 1500 });
    rerender(<KomponenLaborInput {...base} locked={false} packing={{ nama: "Packing S", harga: 1500 }} onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: /Packing S/ }));
    expect(onP).toHaveBeenLastCalledWith(undefined);
  });
});

// Regresi bug produksi 2026-07-21: di http://<IP> (non-secure context)
// crypto.randomUUID undefined → klik chip melempar TypeError → tak terjadi apa-apa.
describe("KomponenLaborInput tanpa crypto.randomUUID (http:// + IP)", () => {
  const asli = globalThis.crypto;
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: asli.getRandomValues.bind(asli) }, // randomUUID SENGAJA tak ada
      configurable: true, writable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", { value: asli, configurable: true, writable: true });
  });

  it("chip komponen tetap bisa dipilih", () => {
    const onK = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onKomponenChange={onK} />);
    fireEvent.click(screen.getByText(/Gantungan kew-kew/));
    expect(onK).toHaveBeenCalledTimes(1);
    expect(onK.mock.calls[0][0][0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900 });
    expect(onK.mock.calls[0][0][0].id).toBeTruthy();
  });

  it("chip labor bundle tetap bisa dipilih", () => {
    const onL = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onLaborChange={onL} />);
    fireEvent.click(screen.getByText(/Mask Medium/));
    expect(onL.mock.calls[0][0]).toHaveLength(3);
    expect(onL.mock.calls[0][0].every((r: { id?: string }) => !!r.id)).toBe(true);
  });
});
