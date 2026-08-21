import { describe, it, expect } from "vitest";
import { getPrinterBrand } from "./printer-brand";

describe("getPrinterBrand", () => {
  it("bambu -> selalu 'Bambu Lab' apapun modelnya (1 connector = 1 brand)", () => {
    expect(getPrinterBrand("bambu", "P1S")).toBe("Bambu Lab");
    expect(getPrinterBrand("bambu", null)).toBe("Bambu Lab");
  });

  it("moonraker -> merek ditentukan dari model, BUKAN nama connector/engine", () => {
    expect(getPrinterBrand("moonraker", "U1")).toBe("Snapmaker");
    expect(getPrinterBrand("moonraker", "u1")).toBe("Snapmaker");
    expect(getPrinterBrand("moonraker", "Voron")).toBe("Voron");
    expect(getPrinterBrand("moonraker", "Ender3")).toBe("Creality");
  });

  it("moonraker dengan model tak dikenal/kosong -> fallback generik 'Klipper', bukan 'moonraker'", () => {
    expect(getPrinterBrand("moonraker", "RandomDIYBuild")).toBe("Klipper");
    expect(getPrinterBrand("moonraker", null)).toBe("Klipper");
    expect(getPrinterBrand("moonraker", "")).toBe("Klipper");
  });

  it("printerType tak dikenal -> tampilkan apa adanya (bukan string kosong)", () => {
    expect(getPrinterBrand("somethingElse", "X")).toBe("somethingElse");
    expect(getPrinterBrand(null, "X")).toBe("—");
  });
});
