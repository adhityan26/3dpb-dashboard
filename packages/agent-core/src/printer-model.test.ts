import { describe, it, expect, vi } from "vitest";
import { suggestModelFromSsdp, matchDeviceByName, CYD_TYPE_FALLBACK } from "./printer-model";

describe("CYD_TYPE_FALLBACK", () => {
  it("Bambu Lab & Klipper, dua-duanya masuk batas 11 byte buffer firmware", () => {
    expect(CYD_TYPE_FALLBACK).toEqual({ bambu: "Bambu Lab", moonraker: "Klipper" });
    expect(Buffer.byteLength(CYD_TYPE_FALLBACK.bambu, "utf8")).toBeLessThanOrEqual(11);
    expect(Buffer.byteLength(CYD_TYPE_FALLBACK.moonraker, "utf8")).toBeLessThanOrEqual(11);
  });
});

describe("suggestModelFromSsdp", () => {
  it("kode DevModel dikenal -> model kanonik", () => {
    expect(suggestModelFromSsdp("C12")).toBe("P1S");
    expect(suggestModelFromSsdp("C11")).toBe("P1P");
    expect(suggestModelFromSsdp("N1")).toBe("A1Mini");
    expect(suggestModelFromSsdp("3DPrinter-X1-Carbon")).toBe("X1C");
  });

  it("kode tak dikenal -> null (tak menebak), tapi catat warning berisi nilai mentahnya", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(suggestModelFromSsdp("3DPrinter-Unknown-Future-Model")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("3DPrinter-Unknown-Future-Model"));
    warnSpy.mockRestore();
  });

  it("devModel string kosong (header DevModel.bambu.com absen) -> null, TANPA warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(suggestModelFromSsdp("")).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("matchDeviceByName", () => {
  const devices = [
    { shortCode: "abc1234567", label: "Neptune" },
    { shortCode: "def1234567", label: "Moon" },
  ];

  it("cocok walau beda kapitalisasi/spasi", () => {
    expect(matchDeviceByName("Neptune", devices)).toBe("abc1234567");
    expect(matchDeviceByName("  neptune ", devices)).toBe("abc1234567");
    expect(matchDeviceByName("MOON", devices)).toBe("def1234567");
  });

  it("null kalau tak ada yang mirip", () => {
    expect(matchDeviceByName("Jupiter", devices)).toBeNull();
  });
});
