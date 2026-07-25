import { describe, it, expect } from "vitest"
import { resolveActualShopeePrice, type ShopeeLinkLike, type ShopeeProductLike } from "../resolve-shopee-price"

describe("resolveActualShopeePrice", () => {
  it("pakai harga varian spesifik yang di-link, bukan priceMin produk", () => {
    const links: ShopeeLinkLike[] = [{ shopeeItemId: "1", shopeeModelId: "model-mahal" }]
    const products: ShopeeProductLike[] = [{
      productId: "1",
      priceMin: 275000, // varian termurah — SEHARUSNYA tidak dipakai
      variantPrices: [
        { modelId: "model-murah", price: 275000 },
        { modelId: "model-mahal", price: 430000 },
      ],
    }]
    expect(resolveActualShopeePrice(links, products)).toBe(430000)
  })

  it("link level-produk (shopeeModelId null) tetap pakai priceMin", () => {
    const links: ShopeeLinkLike[] = [{ shopeeItemId: "1", shopeeModelId: null }]
    const products: ShopeeProductLike[] = [{
      productId: "1", priceMin: 45000, variantPrices: [],
    }]
    expect(resolveActualShopeePrice(links, products)).toBe(45000)
  })

  it("varian yang di-link sudah tidak ketemu di variantPrices → null, tidak fallback ke priceMin (salah varian)", () => {
    const links: ShopeeLinkLike[] = [{ shopeeItemId: "1", shopeeModelId: "model-hilang" }]
    const products: ShopeeProductLike[] = [{
      productId: "1",
      priceMin: 275000,
      variantPrices: [{ modelId: "model-lain", price: 300000 }],
    }]
    expect(resolveActualShopeePrice(links, products)).toBeNull()
  })

  it("beberapa link → ambil harga termurah antar link (paritas perilaku lama)", () => {
    const links: ShopeeLinkLike[] = [
      { shopeeItemId: "1", shopeeModelId: "a" },
      { shopeeItemId: "2", shopeeModelId: null },
    ]
    const products: ShopeeProductLike[] = [
      { productId: "1", priceMin: 999999, variantPrices: [{ modelId: "a", price: 100000 }] },
      { productId: "2", priceMin: 50000, variantPrices: [] },
    ]
    expect(resolveActualShopeePrice(links, products)).toBe(50000)
  })

  it("tidak ada link atau produk kosong → null", () => {
    expect(resolveActualShopeePrice([], [])).toBeNull()
    expect(resolveActualShopeePrice([{ shopeeItemId: "1" }], [])).toBeNull()
  })
})
