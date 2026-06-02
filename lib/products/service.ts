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
  KatalogInfo,
} from "./types"
import { STOCK_LOW_THRESHOLD } from "./types"

// ── In-process cache (stale-while-revalidate) ─────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes: serve from cache, refresh in bg
const STALE_TTL_MS = 30 * 60 * 1000 // 30 minutes: max age before forcing fresh

interface CacheEntry {
  data: ProductsListResult
  cachedAt: number
  refreshing: boolean
}

let _cache: CacheEntry | null = null

/** Invalidate cache (call after stock/HPP mutations). */
export function invalidateProductsCache() {
  _cache = null
}

/**
 * Syncs the ShopeeProductIndex table with current items from Shopee API.
 * Upserts all active items, deletes stale rows.
 */
export async function syncProductIndex(): Promise<{ synced: number; deleted: number }> {
  const itemRefs = await getAllItems(["NORMAL", "UNLIST"])
  if (itemRefs.length === 0) {
    const deleted = await prisma.shopeeProductIndex.deleteMany()
    return { synced: 0, deleted: deleted.count }
  }

  const itemIds = itemRefs.map((r) => r.item_id)
  const baseInfos = await getItemBaseInfoBatch(itemIds)

  // Fetch variant lists for items that have them (to get per-variant stock/price)
  const BATCH = 10
  const variantsByItem = new Map<number, { priceMin: number; priceMax: number; stockTotal: number }>()
  const itemsWithVariants = baseInfos.filter((b) => b.has_model)

  for (let i = 0; i < itemsWithVariants.length; i += BATCH) {
    const chunk = itemsWithVariants.slice(i, i + BATCH)
    await Promise.all(chunk.map(async (item) => {
      try {
        const res = await getModelList(item.item_id)
        const prices = res.model.map((m) => m.price_info?.[0]?.current_price ?? 0).filter((p) => p > 0)
        const stocks = res.model.map((m) => m.stock_info_v2?.summary_info?.total_available_stock ?? 0)
        variantsByItem.set(item.item_id, {
          priceMin: prices.length > 0 ? Math.min(...prices) : 0,
          priceMax: prices.length > 0 ? Math.max(...prices) : 0,
          stockTotal: stocks.reduce((s, v) => s + v, 0),
        })
      } catch {
        variantsByItem.set(item.item_id, { priceMin: 0, priceMax: 0, stockTotal: 0 })
      }
    }))
  }

  // Upsert all with rich data
  await prisma.$transaction(
    baseInfos.map((b) => {
      const hasVariants = b.has_model
      const vData = hasVariants ? variantsByItem.get(b.item_id) : undefined
      const price0 = b.price_info?.[0]?.current_price ?? 0
      const priceMin = hasVariants ? (vData?.priceMin ?? 0) : price0
      const priceMax = hasVariants ? (vData?.priceMax ?? 0) : price0
      const stockTotal = hasVariants
        ? (vData?.stockTotal ?? 0)
        : (b.stock_info_v2?.summary_info?.total_available_stock ?? 0)

      const data = {
        name: b.item_name,
        status: b.item_status,
        imageUrl: b.image?.image_url_list?.[0] ?? null,
        priceMin,
        priceMax,
        stockTotal,
        hasVariants,
      }
      return prisma.shopeeProductIndex.upsert({
        where: { itemId: String(b.item_id) },
        update: data,
        create: { itemId: String(b.item_id), ...data },
      })
    }),
  )

  // Delete stale rows
  const activeIds = itemIds.map(String)
  const deleted = await prisma.shopeeProductIndex.deleteMany({
    where: { itemId: { notIn: activeIds } },
  })

  return { synced: baseInfos.length, deleted: deleted.count }
}

interface GetProductsPageOpts {
  page: number
  limit: number
  q?: string
  status?: string
}

/**
 * Returns a paginated, optionally filtered list of products.
 * Only fetches rich Shopee data (variants, stock, sold stats) for the current page.
 */
export async function getProductsPage(
  opts: GetProductsPageOpts,
): Promise<import("./types").ProductsPageResult> {
  const { page, limit, q, status } = opts
  const skip = (page - 1) * limit

  type WhereInput = NonNullable<Parameters<typeof prisma.shopeeProductIndex.findMany>[0]>["where"]
  const where: WhereInput = {}
  if (q && q.trim() !== "") {
    where.name = { contains: q.trim(), mode: "insensitive" }
  }
  if (status && status !== "all") {
    where.status = status.toUpperCase()
  }

  const [total, indexRows] = await Promise.all([
    prisma.shopeeProductIndex.count({ where }),
    prisma.shopeeProductIndex.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
    }),
  ])

  const totalPages = Math.ceil(total / limit)

  if (indexRows.length === 0) {
    return { products: [], total, page, totalPages, fetchedAt: new Date().toISOString() }
  }

  // ── Serve entirely from DB index + local DB — NO Shopee API calls ──────
  const pageItemIdStrings = indexRows.map((r) => r.itemId)

  const [shopeeLinks, soldStats] = await Promise.all([
    prisma.produkInternalShopeeLink.findMany({
      where: { shopeeItemId: { in: pageItemIdStrings } },
      include: { produkInternal: { include: { primaryKalkulasi: true } } },
    }),
    getCachedSoldStats(),
  ])

  const katalogByItemId = new Map<string, KatalogInfo>()
  for (const link of shopeeLinks) {
    const pi = link.produkInternal
    const k = pi.primaryKalkulasi
    if (k && k.hppTotal > 0) {
      katalogByItemId.set(link.shopeeItemId, {
        id: pi.id,
        nama: pi.nama,
        hppTotal: k.hppTotal,
        floorPrice: k.floorPrice,
        shopeeA: k.shopeeA,
        kalkulasiStatus: k.status,
      })
    }
  }

  const products: ProductSummary[] = indexRows.map((row) => {
    const productIdStr = row.itemId
    const stats = soldStats.get(productIdStr) ?? { qty: 0, omzet: 0 }
    const katalog = katalogByItemId.get(productIdStr) ?? null
    const productHpp = katalog?.hppTotal ?? null
    const grossMargin30d = productHpp !== null
      ? stats.omzet - productHpp * stats.qty
      : null
    const isStockLow = row.stockTotal < STOCK_LOW_THRESHOLD
    const perluPerhatian = isStockLow || stats.qty === 0

    return {
      productId: productIdStr,
      name: row.name,
      status: row.status as ProductStatus,
      imageUrl: row.imageUrl ?? null,
      hasVariants: row.hasVariants,
      stockTotal: row.stockTotal,
      priceMin: row.priceMin,
      priceMax: row.priceMax,
      originalPriceMin: null,  // not stored in index; shown after full fetch
      weight: null,
      dimensionCm: null,
      hpp: productHpp,
      katalog,
      variants: [],            // not stored in index; shown after full fetch
      qtySold30d: stats.qty,
      omzet30d: stats.omzet,
      grossMargin30d,
      isStockLow,
      perluPerhatian,
      lowestStock: row.stockTotal,
    }
  })

  return {
    products,
    total,
    page,
    totalPages,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Fast KPI counts from DB index — no Shopee API call.
 * stokKritis and perluPerhatian are approximated as 0 (stock data not in index).
 */
export async function getProductsKpi(): Promise<import("./types").ProductsListResult["kpi"]> {
  const [total, unlist] = await Promise.all([
    prisma.shopeeProductIndex.count(),
    prisma.shopeeProductIndex.count({ where: { status: "UNLIST" } }),
  ])
  return {
    totalProducts: total,
    stokKritis: 0,
    perluPerhatian: unlist,
    totalStockItems: 0,
  }
}

interface SoldStats {
  qty: number
  omzet: number
}

// ── Sold stats cache (30-min TTL, shared across page requests) ────────────
let _soldStatsCache: { data: Map<string, SoldStats>; cachedAt: number } | null = null
const SOLD_STATS_TTL = 30 * 60 * 1000

async function getCachedSoldStats(): Promise<Map<string, SoldStats>> {
  const now = Date.now()
  if (_soldStatsCache && now - _soldStatsCache.cachedAt < SOLD_STATS_TTL) {
    return _soldStatsCache.data
  }
  const data = await getSoldStatsPerItem()
  _soldStatsCache = { data, cachedAt: now }
  return data
}

/**
 * Aggregate sold qty and omzet per item_id from the last 30 days of orders.
 * Optionally scoped to a specific set of item IDs (much faster for paginated views).
 */
async function getSoldStatsPerItem(itemIds?: string[]): Promise<Map<string, SoldStats>> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * 24 * 60 * 60
  const orders = await getOrdersInRange({ timeFrom: from, timeTo: now })
  const filterSet = itemIds ? new Set(itemIds) : null

  const map = new Map<string, SoldStats>()
  for (const order of orders) {
    for (const item of order.item_list) {
      const key = String(item.item_id)
      if (filterSet && !filterSet.has(key)) continue
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
 * Fetch products fresh from Shopee API (no cache).
 */
async function fetchProductsFresh(): Promise<ProductsListResult> {
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
      const variants: VariantSummary[] = models.map((m) => {
        const current = m.price_info?.[0]?.current_price ?? 0
        const original = m.price_info?.[0]?.original_price ?? 0
        return {
          variantId: String(m.model_id),
          variantName: m.model_name ?? `Varian ${m.model_id}`,
          sku: m.model_sku ?? null,
          stock: m.stock_info_v2?.summary_info?.total_available_stock ?? 0,
          price: current,
          originalPrice: original > 0 && original > current ? original : null,
          hpp: null,
        }
      })
      variantsByItem.set(itemId, variants)
    }
  }

  const itemIdStrings = itemIds.map(String)

  const [shopeeLinks, soldStats] = await Promise.all([
    prisma.produkInternalShopeeLink.findMany({
      where: { shopeeItemId: { in: itemIdStrings } },
      include: {
        produkInternal: {
          include: { primaryKalkulasi: true },
        },
      },
    }),
    getSoldStatsPerItem(),
  ])

  // Map shopeeItemId -> KatalogInfo (from linked ProdukInternal's primary kalkulasi)
  const katalogByItemId = new Map<string, KatalogInfo>()
  for (const link of shopeeLinks) {
    const pi = link.produkInternal
    const k = pi.primaryKalkulasi
    if (k && k.hppTotal > 0) {
      katalogByItemId.set(link.shopeeItemId, {
        id: pi.id,
        nama: pi.nama,
        hppTotal: k.hppTotal,
        floorPrice: k.floorPrice,
        shopeeA: k.shopeeA,
        kalkulasiStatus: k.status,
      })
    }
  }

  const products: ProductSummary[] = baseInfos.map((b) => {
    const productIdStr = String(b.item_id)
    const hasVariants = b.has_model
    const variants = hasVariants
      ? (variantsByItem.get(b.item_id) ?? [])
      : []

    const stockTotal = hasVariants
      ? variants.reduce((s, v) => s + v.stock, 0)
      : (b.stock_info_v2?.summary_info?.total_available_stock ?? 0)

    const prices = hasVariants
      ? variants.map((v) => v.price).filter((p) => p > 0)
      : [b.price_info?.[0]?.current_price ?? 0]
    const priceMin = prices.length > 0 ? Math.min(...prices) : 0
    const priceMax = prices.length > 0 ? Math.max(...prices) : 0

    // Original price for strikethrough (only when there's a discount)
    const origPrices = hasVariants
      ? variants.map((v) => v.originalPrice).filter((p): p is number => p !== null && p > 0)
      : (() => { const op = b.price_info?.[0]?.original_price ?? 0; return op > priceMin ? [op] : [] })()
    const originalPriceMin = origPrices.length > 0 ? Math.min(...origPrices) : null

    // Weight and dimensions
    const weight = b.weight ?? null
    const dim = b.dimension
    const dimensionCm = (dim?.package_length && dim?.package_width && dim?.package_height)
      ? { l: dim.package_length, w: dim.package_width, h: dim.package_height }
      : null

    const stats = soldStats.get(productIdStr) ?? { qty: 0, omzet: 0 }
    const katalog = katalogByItemId.get(productIdStr) ?? null
    const productHpp = katalog?.hppTotal ?? null

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
      originalPriceMin,
      weight,
      dimensionCm,
      hpp: productHpp,
      katalog,
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
 * Get all products — served from cache when fresh, background-refreshes when stale.
 * First call (cold cache) fetches live and may be slow.
 */
export async function getProducts(): Promise<ProductsListResult> {
  const now = Date.now()

  if (_cache) {
    const age = now - _cache.cachedAt
    if (age < CACHE_TTL_MS) {
      // Fresh — serve immediately
      return _cache.data
    }
    if (age < STALE_TTL_MS) {
      // Stale but usable — serve stale data and kick off background refresh
      if (!_cache.refreshing) {
        _cache.refreshing = true
        fetchProductsFresh()
          .then(data => { _cache = { data, cachedAt: Date.now(), refreshing: false } })
          .catch(() => { if (_cache) _cache.refreshing = false })
      }
      return _cache.data
    }
  }

  // No cache or too stale — fetch fresh and block
  const data = await fetchProductsFresh()
  _cache = { data, cachedAt: now, refreshing: false }
  return data
}

/**
 * Set HPP for a product and/or per-variant overrides.
 *
 * Semantics:
 * - `productHpp === undefined` → don't touch product-level HPP
 * - `productHpp === null` → delete product-level HPP
 * - `productHpp === <number>` → upsert product-level HPP
 *
 * Same semantics for each entry in `variantOverrides`:
 * - `hpp === null` → delete that variant override
 * - `hpp === <number>` → upsert that variant override
 *
 * Variants not listed in `variantOverrides` are untouched.
 */
export async function setProductHpp(
  productId: string,
  productHpp: number | null | undefined,
  variantOverrides: Array<{ variantId: string; hpp: number | null }>,
): Promise<void> {
  if (productHpp !== undefined) {
    if (productHpp === null) {
      await prisma.productHpp.deleteMany({ where: { productId } })
    } else {
      await prisma.productHpp.upsert({
        where: { productId },
        update: { hpp: productHpp },
        create: { productId, hpp: productHpp },
      })
    }
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
