import { prisma } from "@/lib/db"
import {
  getAllItems,
  getItemBaseInfoBatch,
  getModelList,
} from "@/lib/shopee/products"
import { getOrdersInRange } from "@/lib/orders/service"
import { generateMockProducts } from "./mock"
import type {
  ProductsListResult,
  ProductSummary,
  VariantSummary,
  ProductStatus,
} from "./types"
import { STOCK_LOW_THRESHOLD } from "./types"

interface SoldStats {
  qty: number
  omzet: number
}

/**
 * Aggregate sold qty and omzet per item_id from the last 30 days of orders.
 */
async function getSoldStatsPerItem(): Promise<Map<string, SoldStats>> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * 24 * 60 * 60
  const orders = await getOrdersInRange({ timeFrom: from, timeTo: now })

  const map = new Map<string, SoldStats>()
  for (const order of orders) {
    for (const item of order.item_list) {
      const key = String(item.item_id)
      const existing = map.get(key) ?? { qty: 0, omzet: 0 }
      existing.qty += item.model_quantity_purchased
      existing.omzet +=
        item.model_discounted_price * item.model_quantity_purchased
      map.set(key, existing)
    }
  }
  return map
}

/**
 * Get all products for the shop with stock, HPP, and performance.
 */
export async function getProducts(): Promise<ProductsListResult> {
  if (process.env.SHOPEE_MOCK_PRODUCTS === "true") {
    return generateMockProducts()
  }

  const itemRefs = await getAllItems(["NORMAL", "UNLIST"])
  if (itemRefs.length === 0) {
    return {
      products: [],
      kpi: {
        totalProducts: 0,
        stokKritis: 0,
        perluPerhatian: 0,
        totalStockItems: 0,
      },
      fetchedAt: new Date().toISOString(),
    }
  }

  const itemIds = itemRefs.map((r) => r.item_id)
  const baseInfos = await getItemBaseInfoBatch(itemIds)

  // Fetch variant lists for items that have them (limit concurrency to 10)
  const variantsByItem = new Map<number, VariantSummary[]>()
  const itemsWithVariants = baseInfos.filter((b) => b.has_model)
  const BATCH = 10

  for (let i = 0; i < itemsWithVariants.length; i += BATCH) {
    const chunk = itemsWithVariants.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map(async (item) => {
        try {
          const res = await getModelList(item.item_id)
          return { itemId: item.item_id, models: res.model }
        } catch (err) {
          console.warn(`getModelList failed for item ${item.item_id}:`, err)
          return { itemId: item.item_id, models: [] }
        }
      }),
    )
    for (const { itemId, models } of results) {
      const variants: VariantSummary[] = models.map((m) => ({
        variantId: String(m.model_id),
        variantName: m.model_name ?? `Varian ${m.model_id}`,
        sku: m.model_sku ?? null,
        stock: m.stock_info_v2?.summary_info?.total_available_stock ?? 0,
        price: m.price_info?.[0]?.current_price ?? 0,
        hpp: null,
      }))
      variantsByItem.set(itemId, variants)
    }
  }

  const [productHpps, variantHpps, soldStats] = await Promise.all([
    prisma.productHpp.findMany({
      where: { productId: { in: itemIds.map(String) } },
    }),
    prisma.variantHpp.findMany(),
    getSoldStatsPerItem(),
  ])
  const productHppMap = new Map(
    productHpps.map((p) => [p.productId, p.hpp ?? null] as const),
  )
  const variantHppMap = new Map(
    variantHpps.map((v) => [v.variantId, v.hpp ?? null] as const),
  )

  const products: ProductSummary[] = baseInfos.map((b) => {
    const productIdStr = String(b.item_id)
    const hasVariants = b.has_model
    const variants = hasVariants
      ? (variantsByItem.get(b.item_id) ?? []).map((v) => ({
          ...v,
          hpp: variantHppMap.get(v.variantId) ?? null,
        }))
      : []

    const stockTotal = hasVariants
      ? variants.reduce((s, v) => s + v.stock, 0)
      : (b.stock_info_v2?.summary_info?.total_available_stock ?? 0)

    const prices = hasVariants
      ? variants.map((v) => v.price).filter((p) => p > 0)
      : [b.price_info?.[0]?.current_price ?? 0]
    const priceMin = prices.length > 0 ? Math.min(...prices) : 0
    const priceMax = prices.length > 0 ? Math.max(...prices) : 0

    const stats = soldStats.get(productIdStr) ?? { qty: 0, omzet: 0 }
    const productHpp = productHppMap.get(productIdStr) ?? null

    let grossMargin30d: number | null = null
    if (productHpp !== null) {
      grossMargin30d = stats.omzet - productHpp * stats.qty
    }

    const stockValues = hasVariants
      ? variants.map((v) => v.stock)
      : [stockTotal]
    const lowestStock = stockValues.length > 0 ? Math.min(...stockValues) : 0
    const isStockLow = lowestStock < STOCK_LOW_THRESHOLD
    const noSalesRecent = stats.qty === 0
    const perluPerhatian = isStockLow || noSalesRecent

    return {
      productId: productIdStr,
      name: b.item_name,
      status: b.item_status as ProductStatus,
      imageUrl: b.image?.image_url_list?.[0] ?? null,
      hasVariants,
      stockTotal,
      priceMin,
      priceMax,
      hpp: productHpp,
      variants,
      qtySold30d: stats.qty,
      omzet30d: stats.omzet,
      grossMargin30d,
      isStockLow,
      perluPerhatian,
      lowestStock,
    }
  })

  products.sort((a, b) => {
    if (a.perluPerhatian !== b.perluPerhatian) {
      return a.perluPerhatian ? -1 : 1
    }
    return b.omzet30d - a.omzet30d
  })

  const stokKritis = products.filter((p) => p.isStockLow).length
  const perluPerhatian = products.filter((p) => p.perluPerhatian).length
  const totalStockItems = products.reduce((s, p) => s + p.stockTotal, 0)

  return {
    products,
    kpi: {
      totalProducts: products.length,
      stokKritis,
      perluPerhatian,
      totalStockItems,
    },
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Set HPP for a product and optional per-variant overrides.
 */
export async function setProductHpp(
  productId: string,
  productHpp: number | null,
  variantOverrides: Array<{ variantId: string; hpp: number | null }>,
): Promise<void> {
  if (productHpp === null) {
    await prisma.productHpp.deleteMany({ where: { productId } })
  } else {
    await prisma.productHpp.upsert({
      where: { productId },
      update: { hpp: productHpp },
      create: { productId, hpp: productHpp },
    })
  }

  for (const { variantId, hpp } of variantOverrides) {
    if (hpp === null) {
      await prisma.variantHpp.deleteMany({ where: { variantId } })
    } else {
      await prisma.variantHpp.upsert({
        where: { variantId },
        update: { hpp },
        create: { variantId, productId, hpp },
      })
    }
  }
}

/**
 * Count products that need attention (stock low or no recent sales).
 * Used for TabNav badge. Reuses full getProducts for simplicity.
 */
export async function countPerluPerhatian(): Promise<number> {
  const result = await getProducts()
  return result.kpi.perluPerhatian
}
