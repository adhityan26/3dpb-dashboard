import { tokopediaRequest } from "./client"

export type TokopediaRawOrder = Record<string, unknown>
export interface TokopediaRawData {
  total_count: number
  main_orders: TokopediaRawOrder[]
}

export type TokopediaTab = "perlu-dikirim" | "menunggu-pengambilan" | "dikirim" | "selesai"

// Real Seller Center tab bodies (verified from the network payload — the tab is
// selected entirely by the POST body, the URL is identical across tabs).
// Under "Perlu dikirim" there are two sub-states: order_status 1 = menunggu pengiriman,
// order_status 2 = menunggu pengambilan (kurir belum pickup).
const TAB_CONFIG: Record<TokopediaTab, { condition_list: Record<string, unknown>; sort_info: string }> = {
  "perlu-dikirim":        { condition_list: { order_status: { value: ["1"] }, search_tab: { value: ["101"] } }, sort_info: "11" },
  "menunggu-pengambilan": { condition_list: { order_status: { value: ["2"] }, search_tab: { value: ["101"] } }, sort_info: "11" },
  "dikirim":              { condition_list: { search_tab: { value: ["102"] } }, sort_info: "6" },
  "selesai":              { condition_list: { search_tab: { value: ["103"] } }, sort_info: "6" },
}

export async function listOrders(
  tab: TokopediaTab,
  opts: { count?: number; offset?: number } = {},
): Promise<TokopediaRawData> {
  const cfg = TAB_CONFIG[tab]
  const body = {
    count: opts.count ?? 20,
    offset: opts.offset ?? 0,
    pagination_type: 0,
    sort_info: cfg.sort_info,
    search_condition: { condition_list: cfg.condition_list },
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
