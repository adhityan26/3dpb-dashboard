import { describe, it, expect } from "vitest";
import { fitDimensions } from "./compress";

describe("fitDimensions", () => {
  it("tak mengubah bila sudah di bawah maks", () => {
    expect(fitDimensions(800, 600, 1280)).toEqual({ w: 800, h: 600 });
  });
  it("skala turun berdasar sisi terpanjang (landscape)", () => {
    expect(fitDimensions(2560, 1440, 1280)).toEqual({ w: 1280, h: 720 });
  });
  it("skala turun (portrait)", () => {
    expect(fitDimensions(1000, 2000, 1000)).toEqual({ w: 500, h: 1000 });
  });
  it("bulatkan ke integer", () => {
    const out = fitDimensions(1333, 1000, 1000);
    expect(Number.isInteger(out.w) && Number.isInteger(out.h)).toBe(true);
    expect(out.w).toBe(1000);
  });
});
