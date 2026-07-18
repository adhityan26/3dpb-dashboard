import { describe, it, expect } from "vitest";
import { crc16ccitt, generateDynamicQris } from "@/lib/qris/dynamic";

// QRIS statik sintetis: ada point-of-init "010211" + CRC "6304XXXX" di akhir.
const STATIC = "00020101021126610014ID.CO.QRIS.WWW0215ID10200000000000303UMI5204581253033605802ID5909Toko Test6007Bandung6304ABCD";

describe("crc16ccitt", () => {
  it("check value standar '123456789' → 29B1", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("generateDynamicQris", () => {
  it("set point-of-init jadi 12 (dinamis)", () => {
    expect(generateDynamicQris(STATIC, 149347)).toContain("010212");
    expect(generateDynamicQris(STATIC, 149347)).not.toContain("010211");
  });
  it("sisip tag 54 dengan panjang benar", () => {
    expect(generateDynamicQris(STATIC, 149347)).toContain("5406149347"); // 6 digit → len 06
    expect(generateDynamicQris(STATIC, 5000)).toContain("54045000");     // 4 digit → len 04
  });
  it("CRC akhir valid (re-validasi ulang)", () => {
    const out = generateDynamicQris(STATIC, 149347);
    const body = out.slice(0, -4);
    const crc = out.slice(-4);
    expect(body.endsWith("6304")).toBe(true);
    expect(crc16ccitt(body)).toBe(crc);
  });
  it("tak ada CRC lama tersisa (63 hanya sekali di akhir)", () => {
    const out = generateDynamicQris(STATIC, 149347);
    expect(out.indexOf("6304")).toBe(out.length - 8);
  });
});
