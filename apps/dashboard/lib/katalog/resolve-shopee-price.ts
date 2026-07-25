export interface ShopeeLinkLike {
  shopeeItemId: string
  shopeeModelId?: string | null
}

export interface ShopeeProductLike {
  productId: string
  priceMin: number
  variantPrices: { modelId: string; price: number }[]
}

/** Resolusi harga Shopee aktual dari daftar link katalog → produk Shopee.
 *  Link ke varian spesifik (`shopeeModelId` terisi) HARUS pakai harga varian
 *  itu, bukan `priceMin` produk (yang bisa jadi varian lain yang lebih murah).
 *  Link level-produk (`shopeeModelId` null) tetap pakai `priceMin`.
 *  Kalau ada beberapa link, ambil yang termurah (paritas perilaku lama). */
export function resolveActualShopeePrice(
  links: ShopeeLinkLike[],
  products: ShopeeProductLike[],
): number | null {
  if (links.length === 0 || products.length === 0) return null
  const productsById = new Map(products.map(p => [p.productId, p]))
  const prices = links
    .map(link => {
      const p = productsById.get(link.shopeeItemId)
      if (!p) return null
      if (link.shopeeModelId) {
        const variant = p.variantPrices.find(v => v.modelId === link.shopeeModelId)
        return variant && variant.price > 0 ? variant.price : null
      }
      return p.priceMin > 0 ? p.priceMin : null
    })
    .filter((p): p is number => p !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}
