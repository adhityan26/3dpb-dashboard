export type TokopediaErrorCode =
  | "SESSION_MISSING" | "SESSION_INVALID" | "SESSION_EXPIRED" | "NOT_FOUND" | "UNKNOWN"

export class TokopediaError extends Error {
  code: TokopediaErrorCode
  constructor(code: TokopediaErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = "TokopediaError"
  }
}

export interface SessionMeta {
  sellerId: string
  appId: string
  updatedAt: string
  tokenExpiry: string | null
}

export interface StoredSession {
  cookies: Record<string, string>
  sellerId: string
  appId: string
  userAgent: string | null
  updatedAt: string
  tokenExpiry: string | null
}

export interface TokopediaOrderSummary {
  orderId: string
  statusCode: number | null
  statusLabel: string
  products: { name: string; variant: string; qty: number; totalPrice: number; imageUrl: string | null }[]
  courier: string | null
  serviceType: string | null      // logistics_service_name e.g. "Kargo"
  shippingType: string | null     // logistics_service_level e.g. "Pengiriman Ekonomis" (what the Seller UI shows)
  trackingNo: string | null
  latestLogistic: { msg: string; timestamp: number } | null
  grandTotal: number
  subTotal: number
  buyerNickname: string | null
  orderDate: number | null        // trade_order_module.create_time (unix sec)
  latestRtsTime: number | null    // ship-by deadline (unix sec)
  payMethod: string | null        // trade_order_module.pay_method e.g. "GoPay"
  isPreOrder: boolean
  note: string | null
}
