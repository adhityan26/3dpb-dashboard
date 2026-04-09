import { prisma } from "@/lib/db"
import { getOrderList, getOrderDetail } from "@/lib/shopee/orders"
import type { OrderSummary, OrderListResult, OrderItemSummary } from "./types"
import type { ShopeeOrderDetail } from "@/lib/shopee/types"

const FIFTEEN_DAYS_SEC = 15 * 24 * 60 * 60

export async function getReadyToShipOrders(): Promise<OrderListResult> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - FIFTEEN_DAYS_SEC

  const allSns: string[] = []
  let cursor: string | undefined
  let hasMore = true
  let safetyCounter = 0

  while (hasMore && safetyCounter < 20) {
    const page = await getOrderList({
      timeFrom: from,
      timeTo: now,
      status: "READY_TO_SHIP",
      pageSize: 50,
      cursor,
    })
    for (const entry of page.order_list) {
      allSns.push(entry.order_sn)
    }
    hasMore = page.more
    cursor = page.next_cursor
    safetyCounter++
  }

  const allDetails: ShopeeOrderDetail[] = []
  for (let i = 0; i < allSns.length; i += 50) {
    const batch = allSns.slice(i, i + 50)
    const details = await getOrderDetail(batch)
    allDetails.push(...details)
  }

  const labelStatuses = await prisma.labelStatus.findMany({
    where: { orderId: { in: allSns } },
  })
  const labelBySn = new Map(labelStatuses.map((l) => [l.orderId, l]))

  const orders: OrderSummary[] = allDetails.map((d) => {
    const items: OrderItemSummary[] = d.item_list.map((it) => ({
      productName: it.item_name,
      variantName: it.model_name ?? null,
      sku: it.model_sku ?? it.item_sku ?? null,
      qty: it.model_quantity_purchased,
      unitPrice: it.model_discounted_price,
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
    }
  })

  orders.sort((a, b) => b.createTime - a.createTime)

  const total = orders.length
  const sudahCetak = orders.filter((o) => o.labelPrinted).length
  const belumCetak = total - sudahCetak

  return {
    orders,
    kpi: { total, belumCetak, sudahCetak },
    fetchedAt: new Date().toISOString(),
  }
}

export async function countBelumCetak(): Promise<number> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - FIFTEEN_DAYS_SEC

  const allSns: string[] = []
  let cursor: string | undefined
  let hasMore = true
  let safetyCounter = 0

  while (hasMore && safetyCounter < 20) {
    const page = await getOrderList({
      timeFrom: from,
      timeTo: now,
      status: "READY_TO_SHIP",
      pageSize: 100,
      cursor,
    })
    for (const entry of page.order_list) {
      allSns.push(entry.order_sn)
    }
    hasMore = page.more
    cursor = page.next_cursor
    safetyCounter++
  }

  if (allSns.length === 0) return 0

  const printed = await prisma.labelStatus.count({
    where: { orderId: { in: allSns }, printed: true },
  })
  return allSns.length - printed
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
