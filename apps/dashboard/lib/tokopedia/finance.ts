import { tokopediaGet } from "./client"

interface Money { amount?: string }

// One order's row from Seller Center's Penghasilan (statement) page. Amounts are
// strings of whole rupiah; fees are negative.
export interface TokopediaStatementOrder {
  reference_id: string
  settlement_amount?: Money
  earning_amount?: Money
  fees?: Money
  settlement_status?: number       // 1 = waiting to be released, 2 = released
  settlement_time?: string         // ms epoch, only once released
  estimate_settle_time?: string
}

interface StatementOrderListData {
  order_records?: TokopediaStatementOrder[]
  total_record?: number
}

export interface StatementOrderPage {
  orders: TokopediaStatementOrder[]
  total: number
}

/**
 * One page of settlement rows, newest order first. `size` up to 100 is accepted
 * (verified 2026-10-07); offset paging via `from` works, the returned cursor does not
 * advance the page, so don't use it.
 */
export async function listStatementOrders(opts: { from: number; size: number }): Promise<StatementOrderPage> {
  const data = await tokopediaGet<StatementOrderListData>("/api/v1/pay/statement/order/list", {
    pagination_type: "1",
    from: String(opts.from),
    size: String(opts.size),
    cursor: "",
    page_type: "12",
    need_total_amount: "true",
  })
  return { orders: data?.order_records ?? [], total: data?.total_record ?? 0 }
}
