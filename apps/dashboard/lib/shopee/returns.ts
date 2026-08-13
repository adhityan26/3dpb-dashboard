import { shopeeRequest } from "./client"

export interface ShopeeReturnEntry {
  return_sn: string
  order_sn: string
  status: string
  refund_amount: number
}

interface ReturnListResponse {
  response: {
    return: ShopeeReturnEntry[]
    more: boolean
    next_cursor?: string
  }
}

// Statuses meaning the return has been resolved with a refund actually
// paid out — these are the ones that mean cached escrow data is stale.
// NOTE: verify against live Shopee /api/v2/returns/get_return_list
// responses; adjust this set if the real enum differs.
const FINAL_REFUNDED_STATUSES = new Set(["REFUND_APPROVED", "COMPLETED"])

export function isReturnFinal(status: string): boolean {
  return FINAL_REFUNDED_STATUSES.has(status)
}

export async function getReturnListForOrders(params: {
  createTimeFrom: number
  createTimeTo: number
  orderSns: string[]
}): Promise<ShopeeReturnEntry[]> {
  const wanted = new Set(params.orderSns)
  const all: ShopeeReturnEntry[] = []
  let cursor: string | undefined
  let hasMore = true
  let safety = 0

  while (hasMore && safety < 20) {
    const json = await shopeeRequest<ReturnListResponse>(
      "/api/v2/returns/get_return_list",
      {
        create_time_from: params.createTimeFrom,
        create_time_to: params.createTimeTo,
        page_size: 100,
        ...(cursor ? { cursor } : {}),
      },
    )
    all.push(...(json.response.return ?? []))
    hasMore = json.response.more
    cursor = json.response.next_cursor
    if (hasMore && !cursor) break
    safety++
  }

  return all.filter((r) => wanted.has(r.order_sn))
}
