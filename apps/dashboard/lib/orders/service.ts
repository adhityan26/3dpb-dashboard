import { prisma } from "@/lib/db"
import { getOrderList, getOrderDetail } from "@/lib/shopee/orders"
import type { OrderSummary, OrderListResult, OrderItemSummary } from "./types"
import type {
  ShopeeOrderDetail,
  ShopeeOrderStatus,
} from "@/lib/shopee/types"

// Shopee's order-list API filters by create_time, not "still unshipped" —
// an order created more than 15 days ago that's STILL stuck READY_TO_SHIP/
// PROCESSED used to fall out of the single 15-day window getReadyToShipOrders()
// queried, silently disappearing from "belum dikirim" counts (found via a
// Shopee export showing orders as old as 23 days still Perlu Dikirim, 2026-09-15).
// 90 days covers realistic backlogs while keeping the chunked call count sane.
const UNSHIPPED_LOOKBACK_SEC = 90 * 24 * 60 * 60

/**
 * Fetch all order_sn in a SINGLE 15-day window. Shopee API hard limit.
 */
async function getOrderSnsInWindow(params: {
  timeFrom: number
  timeTo: number
  status?: ShopeeOrderStatus
}): Promise<string[]> {
  const sns: string[] = []
  let cursor: string | undefined
  let hasMore = true
  let safetyCounter = 0

  while (hasMore && safetyCounter < 20) {
    const page = await getOrderList({
      timeFrom: params.timeFrom,
      timeTo: params.timeTo,
      status: params.status,
      pageSize: 100,
      cursor,
    })
    for (const entry of page.order_list) {
      sns.push(entry.order_sn)
    }
    hasMore = page.more
    cursor = page.next_cursor
    safetyCounter++
  }

  return sns
}

/**
 * Fetch all order_sn in the given time range, optionally filtered by status.
 * Automatically chunks the range into ≤15-day windows because Shopee Order
 * API enforces that limit per call.
 */
async function getOrderSnsInRange(params: {
  timeFrom: number
  timeTo: number
  status?: ShopeeOrderStatus
}): Promise<string[]> {
  // Chunk into ≤15-day windows (use 14 days to stay safely under)
  const windowSize = 14 * 24 * 60 * 60
  const allSns: string[] = []
  let windowStart = params.timeFrom

  while (windowStart < params.timeTo) {
    const windowEnd = Math.min(windowStart + windowSize, params.timeTo)
    const sns = await getOrderSnsInWindow({
      timeFrom: windowStart,
      timeTo: windowEnd,
      status: params.status,
    })
    allSns.push(...sns)
    windowStart = windowEnd
  }

  return allSns
}

/**
 * Fetch all order_sn in the given time range, optionally filtered by status.
 * Returns full order details. Automatically chunks the range into ≤15-day
 * windows because Shopee Order API enforces that limit per call.
 */
export async function getOrdersInRange(params: {
  timeFrom: number // unix seconds
  timeTo: number
  status?: ShopeeOrderStatus
}): Promise<ShopeeOrderDetail[]> {
  const allSns = await getOrderSnsInRange(params)

  // Dedupe in case chunk boundaries produce overlap (shouldn't, but safe)
  const uniqueSns = Array.from(new Set(allSns))

  const allDetails: ShopeeOrderDetail[] = []
  for (let i = 0; i < uniqueSns.length; i += 50) {
    const batch = uniqueSns.slice(i, i + 50)
    const details = await getOrderDetail(batch)
    allDetails.push(...details)
  }

  return allDetails
}

export async function getReadyToShipOrders(): Promise<OrderListResult> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - UNSHIPPED_LOOKBACK_SEC

  // Fetch both unshipped statuses in parallel, each chunked across the full
  // lookback window (a single 15-day window would silently miss orders
  // still stuck unshipped from further back — see UNSHIPPED_LOOKBACK_SEC).
  const statuses = ["READY_TO_SHIP", "PROCESSED"] as const
  const allSns: string[] = []

  await Promise.all(statuses.map(async (status) => {
    const sns = await getOrderSnsInRange({ timeFrom: from, timeTo: now, status })
    allSns.push(...sns)
  }))

  // Deduplicate
  const uniqueSns = Array.from(new Set(allSns))

  const allDetails: ShopeeOrderDetail[] = []
  for (let i = 0; i < uniqueSns.length; i += 50) {
    const batch = uniqueSns.slice(i, i + 50)
    const details = await getOrderDetail(batch)
    allDetails.push(...details)
  }

  const labelStatuses = await prisma.labelStatus.findMany({
    where: { orderId: { in: uniqueSns } },
  })
  const labelBySn = new Map(labelStatuses.map((l) => [l.orderId, l]))

  const orders: OrderSummary[] = allDetails.map((d) => {
    const items: OrderItemSummary[] = d.item_list.map((it) => ({
      lineItemId: it.line_item_id ?? null,
      itemId: it.item_id,
      modelId: it.model_id ?? null,
      cancelledQty: it.cancelled_qty ?? 0,
      productName: it.item_name,
      variantName: it.model_name ?? null,
      sku: it.model_sku ?? it.item_sku ?? null,
      qty: it.model_quantity_purchased,
      unitPrice: it.model_discounted_price,
      imageUrl: it.image_info?.image_url ?? null,
    }))

    const label = labelBySn.get(d.order_sn)
    return {
      orderSn: d.order_sn,
      shopeeStatus: d.order_status,
      createTime: d.create_time,
      updateTime: d.update_time,
      totalAmount: d.total_amount,
      currency: d.currency,
      buyerUsername: d.buyer_username ?? null,
      items,
      labelPrinted: label?.printed ?? false,
      labelPrintedAt: label?.printedAt?.toISOString() ?? null,
      labelPrintedBy: label?.printedBy ?? null,
      isPreOrder: (d.days_to_ship ?? 0) >= 7,
      shipByDate: d.ship_by_date ?? null,
      shippingCarrier: d.shipping_carrier ?? null,
    }
  })

  orders.sort((a, b) => b.createTime - a.createTime)

  const total = orders.length
  const orderBaru = orders.filter((o) => o.shopeeStatus === "READY_TO_SHIP").length
  const perluCetak = orders.filter((o) => o.shopeeStatus === "PROCESSED" && !o.labelPrinted).length
  const sudahDiproses = orders.filter((o) => o.shopeeStatus === "PROCESSED" && o.labelPrinted).length

  return {
    orders,
    kpi: { total, orderBaru, perluCetak, sudahDiproses },
    fetchedAt: new Date().toISOString(),
  }
}

export async function countBelumCetak(): Promise<number> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - UNSHIPPED_LOOKBACK_SEC

  // Count only READY_TO_SHIP — these are orders not yet processed/printed in Shopee
  const sns = await getOrderSnsInRange({ timeFrom: from, timeTo: now, status: "READY_TO_SHIP" })

  return Array.from(new Set(sns)).length
}

export async function setLabelPrinted(
  orderSn: string,
  printed: boolean,
  printedBy: string,
): Promise<void> {
  await prisma.labelStatus.upsert({
    where: { orderId: orderSn },
    update: {
      printed,
      printedAt: printed ? new Date() : null,
      printedBy: printed ? printedBy : null,
    },
    create: {
      orderId: orderSn,
      printed,
      printedAt: printed ? new Date() : null,
      printedBy: printed ? printedBy : null,
    },
  })
}
