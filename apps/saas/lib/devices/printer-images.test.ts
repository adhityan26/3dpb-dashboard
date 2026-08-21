import { describe, it, expect } from "vitest";
import { getPrinterImage } from "./printer-images";

describe("getPrinterImage", () => {
  it("model bambu dikenal -> path thumbnail", () => {
    expect(getPrinterImage("bambu", "P1S")).toBe("/printers/bambu-p1s.jpg");
    expect(getPrinterImage("bambu", "A1Mini")).toBe("/printers/bambu-a1-mini.jpg");
  });

  it("ejaan model toleran (spasi & huruf kecil)", () => {
    expect(getPrinterImage("bambu", "a1 mini")).toBe("/printers/bambu-a1-mini.jpg");
    expect(getPrinterImage("bambu", " x1c ")).toBe("/printers/bambu-x1.jpg");
  });

  it("X1/X1C/X1E berbagi 1 foto, P1P berbagi foto P1S", () => {
    expect(getPrinterImage("bambu", "X1")).toBe("/printers/bambu-x1.jpg");
    expect(getPrinterImage("bambu", "X1E")).toBe("/printers/bambu-x1.jpg");
    expect(getPrinterImage("bambu", "P1P")).toBe("/printers/bambu-p1s.jpg");
  });

  it("lini 2026 (P2S/X2D/H2C/A2L) dikenal, masing-masing punya foto sendiri", () => {
    expect(getPrinterImage("bambu", "P2S")).toBe("/printers/bambu-p2s.jpg");
    expect(getPrinterImage("bambu", "X2D")).toBe("/printers/bambu-x2d.jpg");
    expect(getPrinterImage("bambu", "H2C")).toBe("/printers/bambu-h2c.jpg");
    expect(getPrinterImage("bambu", "A2L")).toBe("/printers/bambu-a2l.jpg");
  });

  it("moonraker U1 (Snapmaker) dikenal, Voron/Ender3 tidak", () => {
    expect(getPrinterImage("moonraker", "U1")).toBe("/printers/snapmaker-u1.jpg");
    expect(getPrinterImage("moonraker", "Voron")).toBeNull();
    expect(getPrinterImage("moonraker", "Ender3")).toBeNull();
  });

  it("model kosong/null, atau printerType tak dikenal -> null (fallback icon generik)", () => {
    expect(getPrinterImage("bambu", null)).toBeNull();
    expect(getPrinterImage("bambu", "")).toBeNull();
    expect(getPrinterImage("someOtherType", "P1S")).toBeNull();
    expect(getPrinterImage(null, "P1S")).toBeNull();
  });
});
