import { describe, it, expect } from "vitest"
import { parseInvoiceItems } from "@/lib/discord/parse-items"

describe("parseInvoiceItems", () => {
  it("parses a single item", () => {
    const r = parseInvoiceItems("Keychain|2|15000")
    expect(r).toEqual({ ok: true, items: [
      { namaProduk: "Keychain", qty: 2, hargaPerUnit: 15000, channelHarga: "marketplace" },
    ] })
  })

  it("parses multiple items separated by ;", () => {
    const r = parseInvoiceItems("Keychain|2|15000; Stand|1|50000")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items).toHaveLength(2)
  })

  it("trims whitespace around fields", () => {
    const r = parseInvoiceItems("  Keychain | 2 | 15000 ")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]).toEqual({ namaProduk: "Keychain", qty: 2, hargaPerUnit: 15000, channelHarga: "marketplace" })
  })

  it("rejects an item missing fields", () => {
    const r = parseInvoiceItems("Keychain|2")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("Keychain|2")
  })

  it("rejects non-numeric qty/harga", () => {
    expect(parseInvoiceItems("Keychain|x|15000").ok).toBe(false)
    expect(parseInvoiceItems("Keychain|2|abc").ok).toBe(false)
  })

  it("rejects zero/negative qty or harga", () => {
    expect(parseInvoiceItems("Keychain|0|15000").ok).toBe(false)
    expect(parseInvoiceItems("Keychain|2|-1").ok).toBe(false)
  })

  it("rejects empty input", () => {
    expect(parseInvoiceItems("   ").ok).toBe(false)
  })
})
