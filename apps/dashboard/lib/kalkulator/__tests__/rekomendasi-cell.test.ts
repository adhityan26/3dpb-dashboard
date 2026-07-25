import { describe, it, expect } from "vitest"
import { cellFor, type HasilLike } from "../rekomendasi-cell"

const HASIL: HasilLike = {
  hppTotal: 29200,
  offlineA: 64500, offlineB: 88000, offlineC: 117500,
  shopeeA: 77400, shopeeB: 105600, shopeeC: 141000, // = offline × 1.2 (fee shopee)
}

describe("cellFor", () => {
  it("offline: net = harga (feeMultiplier 1), laba & margin dari situ", () => {
    const c = cellFor(HASIL, "offline", "B", undefined)
    expect(c.harga).toBe(88000)
    expect(c.laba).toBeCloseTo(88000 - 29200)
    expect(c.marginPct).toBeCloseTo(((88000 - 29200) / 88000) * 100, 3)
  })

  it("shopee tanpa channels prop: fallback feeMultiplier 1.2 (default)", () => {
    const c = cellFor(HASIL, "shopee", "A", undefined)
    const net = 77400 / 1.2
    expect(c.harga).toBe(77400)
    expect(c.laba).toBeCloseTo(net - 29200)
    expect(c.marginPct).toBeCloseTo(((net - 29200) / net) * 100, 3)
  })

  it("shopee dengan channels prop: pakai feeMultiplier dari situ, bukan fallback", () => {
    const channels = [{ id: "shopee", nama: "Shopee", feeMultiplier: 1.5 }]
    const c = cellFor(HASIL, "shopee", "A", channels)
    const net = 77400 / 1.5
    expect(c.laba).toBeCloseTo(net - 29200)
  })

  it("tier A/B/C pilih harga offline/shopee yang benar", () => {
    expect(cellFor(HASIL, "offline", "A", undefined).harga).toBe(64500)
    expect(cellFor(HASIL, "offline", "C", undefined).harga).toBe(117500)
    expect(cellFor(HASIL, "shopee", "C", undefined).harga).toBe(141000)
  })

  it("harga 0 → margin 0, tidak NaN/Infinity", () => {
    const zero: HasilLike = { ...HASIL, offlineA: 0 }
    const c = cellFor(zero, "offline", "A", undefined)
    expect(c.marginPct).toBe(0)
  })
})
