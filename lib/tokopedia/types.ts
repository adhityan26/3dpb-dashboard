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
  serviceType: string | null
  trackingNo: string | null
  latestLogistic: { msg: string; timestamp: number } | null
  grandTotal: number
  subTotal: number
  buyerNickname: string | null
  latestRtsTime: number | null
  note: string | null
}
