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
  hpp: number | null
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
  hpp: number | null
  variants: VariantSummary[]
  qtySold30d: number
  omzet30d: number
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
