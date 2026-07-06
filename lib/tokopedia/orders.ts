import { tokopediaRequest } from "./client"

export type TokopediaRawOrder = Record<string, unknown>
export interface TokopediaRawData {
  total_count: number
  main_orders: TokopediaRawOrder[]
}

export async function listOrders(
  tab: "perlu-dikirim" | "semua",
  opts: { count?: number; offset?: number } = {},
): Promise<TokopediaRawData> {
  const condition_list: Record<string, unknown> =
    tab === "perlu-dikirim"
      ? { order_status: { value: ["1"] }, search_tab: { value: ["101"] } }
      : {}
  const body = {
    count: opts.count ?? 20,
    offset: opts.offset ?? 0,
    pagination_type: 0,
    sort_info: "11",
    search_condition: { condition_list },
    search_cursor: "",
  }
  return tokopediaRequest<TokopediaRawData>(body)
}

export async function getOrderById(id: string): Promise<TokopediaRawOrder | null> {
  const body = {
    count: 1,
    offset: 0,
    pagination_type: 0,
    sort_info: "11",
    search_condition: { condition_list: { main_order_id: { value: [id] } } },
    search_cursor: "",
  }
  const data = await tokopediaRequest<TokopediaRawData>(body)
  return data.main_orders[0] ?? null
}
