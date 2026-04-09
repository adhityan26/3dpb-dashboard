import { getOrdersInRange } from "@/lib/orders/service"
import { getAllAdsDailyPerformance } from "@/lib/shopee/ads"
import { prisma } from "@/lib/db"
import { generateMockAnalytics } from "./mock"
import type { AnalyticsData, DailyPoint, TopProduct } from "./types"

export type AnalyticsRange = "7d" | "30d"

function formatShopeeDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

interface DateRangeParts {
  from: Date
  to: Date
  startDate: string
  endDate: string
  shopeeStartDate: string
  shopeeEndDate: string
}

function getDateRange(range: AnalyticsRange): DateRangeParts {
  const to = new Date()
  const days = range === "7d" ? 7 : 30
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return {
    from,
    to,
    startDate: from.toISOString().slice(0, 10),
    endDate: to.toISOString().slice(0, 10),
    shopeeStartDate: formatShopeeDate(from),
    shopeeEndDate: formatShopeeDate(to),
  }
}

function normalizeDateKey(s: string): string {
  // Accept both "YYYY-MM-DD" and "DD-MM-YYYY"
  if (s.length === 10 && s[4] === "-") return s
  if (s.length === 10 && s[2] === "-") {
    const [d, m, y] = s.split("-")
    return `${y}-${m}-${d}`
  }
  return s
}

/**
 * Compute estimated total HPP cost for the given orders by joining with
 * ProductHpp / VariantHpp tables.
 */
async function computeHppForOrders(
  orders: Array<{
    item_list: Array<{
      item_id: number
      model_id?: number
      model_quantity_purchased: number
      model_discounted_price: number
    }>
  }>,
  totalOmzet: number,
): Promise<{ totalHpp: number; hppCoverage: number }> {
  const productIds = new Set<string>()
  const variantIds = new Set<string>()
  for (const o of orders) {
    for (const item of o.item_list) {
      productIds.add(String(item.item_id))
      if (item.model_id) variantIds.add(String(item.model_id))
    }
  }

  if (productIds.size === 0) return { totalHpp: 0, hppCoverage: 0 }

  const [productHpps, variantHpps] = await Promise.all([
    prisma.productHpp.findMany({
      where: { productId: { in: Array.from(productIds) } },
    }),
    prisma.variantHpp.findMany({
      where: { variantId: { in: Array.from(variantIds) } },
    }),
  ])

  const productHppMap = new Map(
    productHpps.map((p) => [p.productId, p.hpp ?? null]),
  )
  const variantHppMap = new Map(
    variantHpps.map((v) => [v.variantId, v.hpp ?? null]),
  )

  let totalHpp = 0
  let coveredOmzet = 0

  for (const o of orders) {
    for (const item of o.item_list) {
      const variantId = item.model_id ? String(item.model_id) : null
      const productId = String(item.item_id)
      const variantHpp = variantId ? variantHppMap.get(variantId) : null
      const productHpp = productHppMap.get(productId) ?? null
      const hpp: number | null = variantHpp ?? productHpp ?? null

      if (hpp !== null) {
        totalHpp += hpp * item.model_quantity_purchased
        coveredOmzet +=
          item.model_discounted_price * item.model_quantity_purchased
      }
    }
  }

  const hppCoverage = totalOmzet > 0 ? coveredOmzet / totalOmzet : 0
  return { totalHpp, hppCoverage }
}

/**
 * Get analytics data for the given range. Uses mock data if SHOPEE_MOCK_ANALYTICS=true.
 */
export async function getAnalytics(
  range: AnalyticsRange,
): Promise<AnalyticsData> {
  const r = getDateRange(range)

  if (process.env.SHOPEE_MOCK_ANALYTICS === "true") {
    return generateMockAnalytics(r.startDate, r.endDate)
  }

  const [orders, adsRows] = await Promise.all([
    getOrdersInRange({
      timeFrom: Math.floor(r.from.getTime() / 1000),
      timeTo: Math.floor(r.to.getTime() / 1000),
    }),
    getAllAdsDailyPerformance({
      startDate: r.shopeeStartDate,
      endDate: r.shopeeEndDate,
    }),
  ])

  // Initialize daily buckets
  const dailyMap = new Map<string, DailyPoint>()
  const days =
    Math.round((r.to.getTime() - r.from.getTime()) / (24 * 60 * 60 * 1000)) + 1
  for (let i = 0; i < days; i++) {
    const d = new Date(r.from.getTime() + i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    dailyMap.set(key, { date: key, omzet: 0, orders: 0, adSpend: 0 })
  }

  // Aggregate orders
  let totalOmzet = 0
  let totalOrders = 0
  const productMap = new Map<string, { qty: number; omzet: number }>()

  for (const order of orders) {
    const orderDate = new Date(order.create_time * 1000)
      .toISOString()
      .slice(0, 10)
    const bucket = dailyMap.get(orderDate)
    if (bucket) {
      bucket.omzet += order.total_amount
      bucket.orders += 1
    }
    totalOmzet += order.total_amount
    totalOrders += 1

    for (const item of order.item_list) {
      const name = item.item_name
      const existing = productMap.get(name) ?? { qty: 0, omzet: 0 }
      existing.qty += item.model_quantity_purchased
      existing.omzet +=
        item.model_discounted_price * item.model_quantity_purchased
      productMap.set(name, existing)
    }
  }

  // Aggregate ads spend
  let totalAdSpend = 0
  for (const row of adsRows) {
    const dateKey = normalizeDateKey(row.date)
    const spend = typeof row.expense === "number" ? row.expense : 0
    totalAdSpend += spend
    const bucket = dailyMap.get(dateKey)
    if (bucket) bucket.adSpend += spend
  }

  // HPP
  const { totalHpp, hppCoverage } = await computeHppForOrders(
    orders,
    totalOmzet,
  )

  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([name, v]) => ({ productName: name, qty: v.qty, omzet: v.omzet }))
    .sort((a, b) => b.omzet - a.omzet)
    .slice(0, 10)

  const overallRoas = totalAdSpend > 0 ? totalOmzet / totalAdSpend : 0
  const avgOrderValue = totalOrders > 0 ? totalOmzet / totalOrders : 0
  const grossProfit = totalOmzet - totalAdSpend
  const netProfit =
    hppCoverage >= 0.5 ? totalOmzet - totalAdSpend - totalHpp : null

  return {
    range: { startDate: r.startDate, endDate: r.endDate },
    fetchedAt: new Date().toISOString(),
    kpi: {
      totalOmzet,
      totalOrders,
      totalAdSpend,
      overallRoas,
      avgOrderValue,
      grossProfit,
      netProfit,
      hppCoverage,
    },
    daily,
    topProducts,
  }
}
