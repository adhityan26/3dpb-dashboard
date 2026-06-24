import { describe, it, expect } from "vitest"
import { rupiah, getOption } from "@/lib/discord/format"

describe("rupiah", () => {
  it("formats with thousands separator and Rp prefix", () => {
    expect(rupiah(15000)).toBe("Rp 15.000")
    expect(rupiah(0)).toBe("Rp 0")
    expect(rupiah(1234567)).toBe("Rp 1.234.567")
  })
})

describe("getOption", () => {
  const opts = [{ name: "buyer", value: "Budi" }, { name: "ongkir", value: 5000 }]
  it("returns the value by name", () => {
    expect(getOption(opts, "buyer")).toBe("Budi")
    expect(getOption(opts, "ongkir")).toBe(5000)
  })
  it("returns undefined for missing name or undefined opts", () => {
    expect(getOption(opts, "nope")).toBeUndefined()
    expect(getOption(undefined, "buyer")).toBeUndefined()
  })
})
