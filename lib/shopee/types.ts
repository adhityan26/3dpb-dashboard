// Shared Shopee Open Platform v2 API types.

export type ShopeeOrderStatus =
  | "UNPAID"
  | "READY_TO_SHIP"
  | "PROCESSED"
  | "RETRY_SHIP"
  | "SHIPPED"
  | "TO_CONFIRM_RECEIVE"
  | "IN_CANCEL"
  | "CANCELLED"
  | "COMPLETED"
  | "INVOICE_PENDING"

export interface ShopeeOrderListItem {
  order_sn: string
  order_status?: ShopeeOrderStatus
}

export interface ShopeeOrderListResponse {
  response: {
    order_list: ShopeeOrderListItem[]
    more: boolean
    next_cursor: string
  }
  error?: string
  message?: string
  request_id?: string
}

export interface ShopeeOrderItemDetail {
  item_id: number
  item_name: string
  item_sku?: string
  model_id?: number
  model_name?: string
  model_sku?: string
  model_quantity_purchased: number
  model_original_price: number
  model_discounted_price: number
}

export interface ShopeeOrderDetail {
  order_sn: string
  order_status: ShopeeOrderStatus
  create_time: number
  update_time: number
  total_amount: number
  currency: string
  buyer_username?: string
  recipient_address?: {
    name?: string
    phone?: string
    town?: string
    district?: string
    city?: string
    state?: string
    region?: string
    zipcode?: string
    full_address?: string
  }
  item_list: ShopeeOrderItemDetail[]
}

export interface ShopeeOrderDetailResponse {
  response: {
    order_list: ShopeeOrderDetail[]
  }
  error?: string
  message?: string
}
