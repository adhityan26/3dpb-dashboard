import { shopeeRequest, shopeeRequestPost } from "./client"

export interface ShopeeEscrowDetail {
  order_sn: string
  buyer_payment_amount: number    // total yang buyer bayar
  escrow_amount: number           // total yang seller terima
  commission_fee: number          // komisi Shopee
  service_fee: number             // biaya layanan
  transaction_fee: number         // biaya payment gateway
  actual_shipping_fee: number     // ongkir yang dicharge ke seller
  order_income?: {
    items?: Array<{
      item_id: number
      item_name: string
      model_id: number
      model_name?: string
      original_price: number
      discounted_price: number
      quantity_purchased: number
    }>
  }
}

interface EscrowDetailResponse {
  order_income: ShopeeEscrowDetail
}

export async function getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null> {
  try {
    const json = await shopeeRequest<EscrowDetailResponse>(
      "/api/v2/payment/get_escrow_detail",
      { order_sn: orderSn }
    )
    return json.order_income ?? null
  } catch (err) {
    console.warn(`[escrow] getEscrowDetail failed for ${orderSn}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Fields of order_income used for a Working Project's income summary. */
export interface ShopeeOrderIncome {
  order_selling_price?: number
  escrow_amount?: number
}

/**
 * Escrow for up to 50 orders in one request (POST get_escrow_detail_batch). Orders whose
 * escrow isn't generated yet come back without order_income and are simply absent from
 * the map. Note: the single-order getEscrowDetail above reads `json.order_income`, but
 * the real payload nests it under `response` — this batch version reads it correctly.
 */
export async function getEscrowDetailBatch(orderSns: string[]): Promise<Map<string, ShopeeOrderIncome>> {
  const out = new Map<string, ShopeeOrderIncome>()
  if (orderSns.length === 0) return out
  const json = await shopeeRequestPost<{
    response?: { escrow_detail?: { order_sn?: string; order_income?: ShopeeOrderIncome } }[]
  }>("/api/v2/payment/get_escrow_detail_batch", {}, { order_sn_list: orderSns })
  for (const r of json.response ?? []) {
    const d = r.escrow_detail
    if (d?.order_sn && d.order_income && typeof d.order_income.escrow_amount === "number") out.set(d.order_sn, d.order_income)
  }
  return out
}
