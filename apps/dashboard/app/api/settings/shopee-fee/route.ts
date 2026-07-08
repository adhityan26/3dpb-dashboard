import { auth } from "@/lib/auth"
import { getOrdersInRange } from "@/lib/orders/service"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { redis } from "@/lib/redis"
import { NextResponse } from "next/server"

const CACHE_KEY = "settings:shopee-fee-analytics"
const CACHE_TTL = 3600  // 1 hour

export interface ShopeeFeeAnalytics {
  period: string                    // e.g. "30 hari terakhir"
  ordersAnalyzed: number
  totalOmzet: number
  totalBuyerPaid: number
  totalReceived: number
  totalCommission: number
  totalServiceFee: number
  totalTransactionFee: number
  totalShippingFee: number
  realFeeRatePct: number            // (1 - received/buyerPaid) * 100
  fetchedAt: string
}

async function rGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function rSet<T>(key: string, data: T, ttlSec: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSec)
  } catch {
    // non-fatal
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cached = await rGet<ShopeeFeeAnalytics>(CACHE_KEY)
  if (cached) return NextResponse.json(cached)

  try {
    const now = Math.floor(Date.now() / 1000)
    const from = now - 30 * 24 * 60 * 60
    const orders = await getOrdersInRange({ timeFrom: from, timeTo: now })
    const uniqueSns = [...new Set(orders.map(o => o.order_sn))]

    let totalOmzet = 0
    let totalBuyerPaid = 0
    let totalReceived = 0
    let totalCommission = 0
    let totalServiceFee = 0
    let totalTransactionFee = 0
    let totalShippingFee = 0
    let ordersAnalyzed = 0

    // Accumulate omzet from order items (raw Shopee fields)
    for (const order of orders) {
      for (const item of order.item_list) {
        totalOmzet += item.model_discounted_price * item.model_quantity_purchased
      }
    }

    // Fetch escrow for each order (concurrency 10)
    // Cache key format shared with service.ts: escrow:{sn} → { buyerPaid, escrow, items }
    type EscrowCache = { buyerPaid: number; escrow: number; items: unknown[] }
    const CONCURRENCY = 10
    for (let i = 0; i < uniqueSns.length; i += CONCURRENCY) {
      const batch = uniqueSns.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async (sn) => {
        const cacheKey = `escrow:${sn}`
        const cachedEntry = await rGet<EscrowCache>(cacheKey)
        if (cachedEntry) {
          // Compact cached form from service.ts — only has buyerPaid/escrow
          return { buyerPaid: cachedEntry.buyerPaid, escrow: cachedEntry.escrow, fromCache: true }
        }
        const detail = await getEscrowDetail(sn)
        if (!detail) return null
        return {
          buyerPaid: detail.buyer_payment_amount,
          escrow: detail.escrow_amount,
          commission: detail.commission_fee ?? 0,
          serviceFee: detail.service_fee ?? 0,
          transactionFee: detail.transaction_fee ?? 0,
          shippingFee: detail.actual_shipping_fee ?? 0,
          fromCache: false,
        }
      }))
      for (const r of results) {
        if (!r) continue
        totalBuyerPaid += r.buyerPaid
        totalReceived += r.escrow
        if (!r.fromCache) {
          totalCommission += (r as { commission: number }).commission ?? 0
          totalServiceFee += (r as { serviceFee: number }).serviceFee ?? 0
          totalTransactionFee += (r as { transactionFee: number }).transactionFee ?? 0
          totalShippingFee += (r as { shippingFee: number }).shippingFee ?? 0
        }
        ordersAnalyzed++
      }
    }

    const realFeeRatePct = totalBuyerPaid > 0
      ? (1 - totalReceived / totalBuyerPaid) * 100
      : 0

    const result: ShopeeFeeAnalytics = {
      period: "30 hari terakhir",
      ordersAnalyzed,
      totalOmzet: Math.round(totalOmzet),
      totalBuyerPaid: Math.round(totalBuyerPaid),
      totalReceived: Math.round(totalReceived),
      totalCommission: Math.round(totalCommission),
      totalServiceFee: Math.round(totalServiceFee),
      totalTransactionFee: Math.round(totalTransactionFee),
      totalShippingFee: Math.round(totalShippingFee),
      realFeeRatePct: Math.round(realFeeRatePct * 10) / 10,
      fetchedAt: new Date().toISOString(),
    }

    await rSet(CACHE_KEY, result, CACHE_TTL)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
