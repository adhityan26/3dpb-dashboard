import { shopeeRequest } from "./client"
import type {
  ShopeeOrderListResponse,
  ShopeeOrderDetailResponse,
  ShopeeOrderStatus,
  ShopeeOrderDetail,
} from "./types"

/**
 * Get list of order_sn within a time range, filtered by status.
 * Time filter uses `create_time` (15-day max window).
 */
export async function getOrderList(params: {
  timeFrom: number // unix seconds
  timeTo: number // unix seconds
  status?: ShopeeOrderStatus
  pageSize?: number
  cursor?: string
}): Promise<ShopeeOrderListResponse["response"]> {
  const query: Record<string, string | number> = {
    time_range_field: "create_time",
    time_from: params.timeFrom,
    time_to: params.timeTo,
    page_size: params.pageSize ?? 50,
  }
  if (params.status) query.order_status = params.status
  if (params.cursor) query.cursor = params.cursor

  const json = await shopeeRequest<ShopeeOrderListResponse>(
    "/api/v2/order/get_order_list",
    query,
  )
  return json.response
}

/**
 * Get full detail for up to 50 orders at once.
 */
export async function getOrderDetail(
  orderSnList: string[],
): Promise<ShopeeOrderDetail[]> {
  if (orderSnList.length === 0) return []

  const fields = [
    "buyer_username",
    "recipient_address",
    "item_list",
    "total_amount",
    "order_status",
    "create_time",
    "update_time",
  ].join(",")

  const json = await shopeeRequest<ShopeeOrderDetailResponse>(
    "/api/v2/order/get_order_detail",
    {
      order_sn_list: orderSnList.join(","),
      response_optional_fields: fields,
    },
  )
  return json.response.order_list
}
