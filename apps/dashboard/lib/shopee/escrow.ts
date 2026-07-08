import { shopeeRequest } from "./client"

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
