export type ProductStatus =
  | "NORMAL"
  | "BANNED"
  | "DELETED"
  | "UNLIST"
  | "REVIEWING"

export interface VariantSummary {
  variantId: string
  variantName: string
  sku: string | null
  stock: number
  price: number
  originalPrice: number | null  // null = no discount active
  hpp: number | null
}

export interface KatalogInfo {
  id: string
  nama: string
  hppTotal: number
  floorPrice: number
  shopeeA: number
  kalkulasiStatus: string
}

export interface ProductSummary {
  productId: string
  name: string
  status: ProductStatus
  imageUrl: string | null
  hasVariants: boolean
  stockTotal: number
  priceMin: number
  priceMax: number
  originalPriceMin: number | null  // for strikethrough display
  weight: number | null            // kg
  dimensionCm: { l: number; w: number; h: number } | null
  /** HPP sourced from linked ProdukInternal.primaryKalkulasi.hppTotal. Null if no katalog link. */
  hpp: number | null
  /** Full katalog record if this Shopee item has a ProdukInternal link. */
  katalog: KatalogInfo | null
  variants: VariantSummary[]
  qtySold30d: number
  omzet30d: number
  buyerPaid30d: number    // real buyer_payment distributed
  received30d: number     // real escrow distributed
  grossMargin30d: number | null
  isStockLow: boolean
  perluPerhatian: boolean
  lowestStock: number
}

export interface ProductsListResult {
  products: ProductSummary[]
  kpi: {
    totalProducts: number
    stokKritis: number
    perluPerhatian: number
    totalStockItems: number
  }
  fetchedAt: string
}

export const STOCK_LOW_THRESHOLD = 5
export const NO_SALES_DAYS_THRESHOLD = 7

export interface ProductsPageResult {
  products: ProductSummary[]
  total: number
  page: number
  totalPages: number
  fetchedAt: string
}
