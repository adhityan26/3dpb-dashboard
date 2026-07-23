import { describe, it, expect } from "vitest";
import { rupiah, ceil500 } from "./format";

describe("ceil500", () => {
  it("membulatkan ke atas kelipatan 500", () => {
    expect(ceil500(187155)).toBe(187500);
    expect(ceil500(54721)).toBe(55000);
    expect(ceil500(1)).toBe(500);
  });
  it("kelipatan pas tak berubah", () => {
    expect(ceil500(187500)).toBe(187500);
    expect(ceil500(0)).toBe(0);
  });
});

describe("rupiah", () => {
  it("format ribuan id-ID dengan prefix Rp", () => {
    expect(rupiah(29370)).toBe("Rp29.370");
    expect(rupiah(0)).toBe("Rp0");
  });
});
