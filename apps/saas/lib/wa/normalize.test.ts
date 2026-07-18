import { describe, it, expect } from "vitest";
import { normalizePhone, detectChannel } from "@/lib/wa/normalize";

describe("normalizePhone", () => {
  it("08xx → 628xx", () => { expect(normalizePhone("08123456789")).toBe("628123456789"); });
  it("+62xx → 628xx", () => { expect(normalizePhone("+628123456789")).toBe("628123456789"); });
  it("62xx tetap", () => { expect(normalizePhone("628123456789")).toBe("628123456789"); });
  it("8xx → 628xx", () => { expect(normalizePhone("8123456789")).toBe("628123456789"); });
  it("buang spasi/strip/kurung", () => { expect(normalizePhone("0812-3456-789")).toBe("628123456789"); });
  it("bukan angka → null", () => { expect(normalizePhone("abc")).toBeNull(); });
  it("terlalu pendek → null", () => { expect(normalizePhone("0812")).toBeNull(); });
  it("email-ish → null", () => { expect(normalizePhone("a@b.com")).toBeNull(); });
});

describe("detectChannel", () => {
  it("ada @ → email", () => { expect(detectChannel("a@b.com")).toBe("email"); });
  it("08xx → phone", () => { expect(detectChannel("08123456789")).toBe("phone"); });
  it("+62 → phone", () => { expect(detectChannel("+628123456789")).toBe("phone"); });
  it("ngawur → null", () => { expect(detectChannel("halo123")).toBeNull(); });
  it("kosong → null", () => { expect(detectChannel("")).toBeNull(); });
});
