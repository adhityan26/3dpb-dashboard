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

// ===== Ads API types =====

export type ShopeeAdStatus = "berjalan" | "dijeda" | "berakhir"
export type ShopeeCampaignType = "product" | "shop"
export type ShopeeBiddingMethod =
  | "gmv_max_roas"
  | "gmv_max_auto"
  | "manual_bidding"
  | "auto_bidding"
  | string

export interface ShopeeAdDailyRow {
  campaign_id: number
  campaign_type?: ShopeeCampaignType
  bidding_method?: ShopeeBiddingMethod
  ad_name?: string
  ad_status?: ShopeeAdStatus
  date: string
  impression?: number
  clicks?: number
  ctr?: number
  expense?: number
  order_amount?: number
  direct_order_amount?: number
  roi?: number
  direct_roi?: number
  broad_roas?: number
  broad_gmv?: number
  item_sold?: number
  direct_item_sold?: number
  item_id?: number
  item_name?: string
}

export interface ShopeeAdsDailyPerformanceResponse {
  response: {
    ad_performance_list?: ShopeeAdDailyRow[]
    list?: ShopeeAdDailyRow[]
    total?: number
  }
  error?: string
  message?: string
}

// ===== Product API types =====

export type ShopeeItemStatus =
  | "NORMAL"
  | "BANNED"
  | "DELETED"
  | "UNLIST"
  | "REVIEWING"

export interface ShopeeItemListEntry {
  item_id: number
  item_status: ShopeeItemStatus
  update_time: number
}

export interface ShopeeItemListResponse {
  response: {
    // Shopee has shipped both names across API versions. Handle both.
    item?: ShopeeItemListEntry[]
    item_list?: ShopeeItemListEntry[]
    total_count?: number
    has_next_page?: boolean
    next_offset?: number
  }
  error?: string
  message?: string
}

export interface ShopeeItemBaseInfo {
  item_id: number
  item_name: string
  item_status: ShopeeItemStatus
  has_model: boolean
  price_info?: Array<{
    current_price: number
    original_price: number
  }>
  stock_info_v2?: {
    summary_info?: {
      total_available_stock?: number
    }
  }
  image?: {
    image_url_list?: string[]
  }
}

export interface ShopeeItemBaseInfoResponse {
  response: {
    item_list: ShopeeItemBaseInfo[]
  }
  error?: string
  message?: string
}

export interface ShopeeModel {
  model_id: number
  model_name?: string
  model_sku?: string
  price_info?: Array<{
    current_price: number
    original_price: number
  }>
  stock_info_v2?: {
    summary_info?: {
      total_available_stock?: number
    }
    seller_stock?: Array<{ stock: number }>
  }
}

export interface ShopeeModelListResponse {
  response: {
    model: ShopeeModel[]
    tier_variation?: Array<{
      name: string
      option_list: Array<{ option: string }>
    }>
  }
  error?: string
  message?: string
}
