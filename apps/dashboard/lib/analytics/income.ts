import { prisma } from "@/lib/db"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { getReturnListForOrders, isReturnFinal } from "@/lib/shopee/returns"

export const RETURN_MUTABLE_WINDOW_DAYS = 30
export const MAX_ESCROW_FETCH_PER_REQUEST = 50
// Hard wall-clock budget for the sync phase, independent of how many orders
// need syncing — bounds request latency so /analisa never hangs waiting on
// a burst of sequential Shopee calls (each individually has its own 8s
// timeout, so even MAX_ESCROW_FETCH_PER_REQUEST orders could otherwise add
// up to minutes). Deadline check happens between calls, not mid-call.
export const ESCROW_SYNC_TIME_BUDGET_MS = 12_000

export interface OrderEscrowRow {
  orderSn: string
  buyerPaymentAmount: number
  escrowAmount: number
  commissionFee: number
  serviceFee: number
  transactionFee: number
  actualShippingFee: number
  hasReturnFlag: boolean
}

interface OrderLike {
  order_sn: string
  order_status: string
  update_time: number
}

function toRow(cached: {
  orderSn: string
  buyerPaymentAmount: number
  escrowAmount: number
  commissionFee: number
  serviceFee: number
  transactionFee: number
  actualShippingFee: number
  hasReturnFlag: boolean
}): OrderEscrowRow {
  return {
    orderSn: cached.orderSn,
    buyerPaymentAmount: cached.buyerPaymentAmount,
    escrowAmount: cached.escrowAmount,
    commissionFee: cached.commissionFee,
    serviceFee: cached.serviceFee,
    transactionFee: cached.transactionFee,
    actualShippingFee: cached.actualShippingFee,
    hasReturnFlag: cached.hasReturnFlag,
  }
}

async function upsertFromEscrowDetail(
  orderSn: string,
  orderCompleteTime: number,
  hasReturnFlag: boolean,
  detail: NonNullable<Awaited<ReturnType<typeof getEscrowDetail>>>,
): Promise<OrderEscrowRow> {
  const data = {
    orderSn,
    buyerPaymentAmount: detail.buyer_payment_amount,
    escrowAmount: detail.escrow_amount,
    commissionFee: detail.commission_fee,
    serviceFee: detail.service_fee,
    transactionFee: detail.transaction_fee,
    actualShippingFee: detail.actual_shipping_fee,
    hasReturnFlag,
    orderCompleteTime,
  }
  await prisma.orderEscrow.upsert({
    where: { orderSn },
    create: data,
    update: data,
  })
  return toRow({ ...data })
}

export async function syncAndGetEscrowForOrders(
  orders: OrderLike[],
  nowSec: number,
): Promise<Map<string, OrderEscrowRow>> {
  const completed = orders.filter((o) => o.order_status === "COMPLETED")
  if (completed.length === 0) return new Map()

  const orderSns = completed.map((o) => o.order_sn)
  const cached = await prisma.orderEscrow.findMany({
    where: { orderSn: { in: orderSns } },
  })
  const cachedBySn = new Map(cached.map((c) => [c.orderSn, c]))

  const result = new Map<string, OrderEscrowRow>()
  const deadline = Date.now() + ESCROW_SYNC_TIME_BUDGET_MS

  // Tahap 1: isi cache yang kosong (dibatasi per request agar tidak timeout)
  const missing = completed
    .filter((o) => !cachedBySn.has(o.order_sn))
    .slice(0, MAX_ESCROW_FETCH_PER_REQUEST)
  for (const order of missing) {
    if (Date.now() > deadline) break // ran out of time budget, rest retried next load
    const detail = await getEscrowDetail(order.order_sn)
    if (!detail) continue // skip on fetch failure, retried next load
    const row = await upsertFromEscrowDetail(
      order.order_sn,
      order.update_time,
      false,
      detail,
    )
    result.set(order.order_sn, row)
  }

  // Tahap 2: cek refund pada order dalam window mutable
  const windowSec = RETURN_MUTABLE_WINDOW_DAYS * 24 * 60 * 60
  const inWindow = completed.filter((o) => {
    const c = cachedBySn.get(o.order_sn)
    if (!c) return false // already handled in tahap 1
    return nowSec - c.orderCompleteTime <= windowSec
  })

  // Orders already flagged as having a reconciled return don't need to be
  // re-checked — the reconciliation already happened once, so skip them
  // both from the returns-list query and from any escrow re-fetch.
  const needsReturnCheck = inWindow.filter((o) => !cachedBySn.get(o.order_sn)!.hasReturnFlag)
  const alreadyFlagged = inWindow.filter((o) => cachedBySn.get(o.order_sn)!.hasReturnFlag)

  for (const order of alreadyFlagged) {
    result.set(order.order_sn, toRow(cachedBySn.get(order.order_sn)!))
  }

  if (needsReturnCheck.length > 0) {
    const oldestComplete = Math.min(...needsReturnCheck.map((o) => cachedBySn.get(o.order_sn)!.orderCompleteTime))
    let returns: Awaited<ReturnType<typeof getReturnListForOrders>> = []
    try {
      returns = await getReturnListForOrders({
        createTimeFrom: oldestComplete,
        createTimeTo: nowSec,
        orderSns: needsReturnCheck.map((o) => o.order_sn),
      })
    } catch {
      returns = [] // best-effort; retried next load
    }

    const finalReturnSns = new Set(
      returns.filter((r) => isReturnFinal(r.status)).map((r) => r.order_sn),
    )

    for (const order of needsReturnCheck) {
      const cachedRow = cachedBySn.get(order.order_sn)!
      if (!finalReturnSns.has(order.order_sn)) {
        result.set(order.order_sn, toRow(cachedRow))
        continue
      }
      if (Date.now() > deadline) {
        result.set(order.order_sn, toRow(cachedRow)) // keep stale data, retry next load
        continue
      }
      const detail = await getEscrowDetail(order.order_sn)
      if (!detail) {
        result.set(order.order_sn, toRow(cachedRow)) // keep stale data, retry next load
        continue
      }
      const row = await upsertFromEscrowDetail(order.order_sn, cachedRow.orderCompleteTime, true, detail)
      result.set(order.order_sn, row)
    }
  }

  // Unconditionally backfill any cached order not yet in result (regardless of inWindow).
  // This ensures orders outside the mutable window are still returned from cache.
  for (const order of completed) {
    const c = cachedBySn.get(order.order_sn)
    if (c && !result.has(order.order_sn)) result.set(order.order_sn, toRow(c))
  }

  return result
}

interface OrderItemLike {
  item_id: number
  item_name: string
  model_quantity_purchased: number
  model_discounted_price: number
}

interface OrderWithItemsLike {
  order_sn: string
  total_amount: number
  item_list: OrderItemLike[]
}

export interface ProductFeeAllocation {
  productName: string
  adminFee: number | null
  received: number | null
  buyerPayment: number | null
  hasReturn: boolean
}

export function allocateFeePerProduct(
  orders: OrderWithItemsLike[],
  escrowByOrderSn: Map<string, OrderEscrowRow>,
): Map<string, ProductFeeAllocation[]> {
  const result = new Map<string, ProductFeeAllocation[]>()

  for (const order of orders) {
    const escrow = escrowByOrderSn.get(order.order_sn)
    const totalFee = escrow
      ? escrow.commissionFee + escrow.serviceFee + escrow.transactionFee
      : 0

    const lines: ProductFeeAllocation[] = order.item_list.map((item) => {
      const itemRevenue = item.model_discounted_price * item.model_quantity_purchased
      const share = order.total_amount > 0 ? itemRevenue / order.total_amount : 0

      return {
        productName: item.item_name,
        adminFee: escrow ? totalFee * share : null,
        received: escrow ? escrow.escrowAmount * share : null,
        buyerPayment: escrow ? escrow.buyerPaymentAmount * share : null,
        hasReturn: escrow?.hasReturnFlag ?? false,
      }
    })

    result.set(order.order_sn, lines)
  }

  return result
}
