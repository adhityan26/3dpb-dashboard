import { describe, it, expect } from "vitest";
import { getPrinterImage } from "./printer-images";

describe("getPrinterImage", () => {
  it("model Bambu dikenal -> path relatif ke aset bundled", () => {
    expect(getPrinterImage("P1S")).toBe("./printers/bambu-p1s.jpg");
    expect(getPrinterImage("A1Mini")).toBe("./printers/bambu-a1-mini.jpg");
  });

  it("ejaan toleran (spasi & huruf kecil)", () => {
    expect(getPrinterImage("a1 mini")).toBe("./printers/bambu-a1-mini.jpg");
    expect(getPrinterImage(" x1c ")).toBe("./printers/bambu-x1.jpg");
  });

  it("X1/X1C/X1E berbagi 1 foto, P1P berbagi foto P1S (sama seperti apps/saas)", () => {
    expect(getPrinterImage("X1")).toBe("./printers/bambu-x1.jpg");
    expect(getPrinterImage("X1E")).toBe("./printers/bambu-x1.jpg");
    expect(getPrinterImage("P1P")).toBe("./printers/bambu-p1s.jpg");
  });

  it("lini 2026 (P2S/X2D/H2C/A2L) dikenal", () => {
    expect(getPrinterImage("P2S")).toBe("./printers/bambu-p2s.jpg");
    expect(getPrinterImage("X2D")).toBe("./printers/bambu-x2d.jpg");
    expect(getPrinterImage("H2C")).toBe("./printers/bambu-h2c.jpg");
    expect(getPrinterImage("A2L")).toBe("./printers/bambu-a2l.jpg");
  });

  it("Snapmaker U1 dikenal, Voron/Ender3 tidak (fallback null)", () => {
    expect(getPrinterImage("U1")).toBe("./printers/snapmaker-u1.jpg");
    expect(getPrinterImage("Voron")).toBeNull();
    expect(getPrinterImage("Ender3")).toBeNull();
  });

  it("model kosong/null/tak dikenal -> null (caller fallback ke icon generik)", () => {
    expect(getPrinterImage(null)).toBeNull();
    expect(getPrinterImage("")).toBeNull();
    expect(getPrinterImage("bambu")).toBeNull(); // connector kind, BUKAN model -- jangan salah cocok
  });
});
