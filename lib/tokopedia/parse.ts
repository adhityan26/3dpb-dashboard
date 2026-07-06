import type { TokopediaRawOrder } from "./orders"
import type { TokopediaOrderSummary } from "./types"

export const SKU_DISPLAY_STATUS: Record<number, string> = {
  110: "Perlu Dikirim",
  111: "Perlu Dikirim",  // pre-order awaiting ship
  120: "Dikirim",
  121: "Dikirim",        // in transit
  122: "Terkirim",       // delivered
  130: "Dikirim",
  140: "Selesai",
}

// product_image is an object { thumb_url_list: string[], thumb_uri, ... }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function productImageUrl(img: any): string | null {
  const url = Array.isArray(img?.thumb_url_list) ? img.thumb_url_list[0] : null
  return typeof url === "string" && url ? url : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(String(v))
  return Number.isFinite(n) ? n : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priceVal(mod: any): number {
  return num(mod?.price_val)
}

export function parseOrder(raw: TokopediaRawOrder): TokopediaOrderSummary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = raw as any
  const statusMod = o.order_status_module?.[0]
  const statusCode: number | null = typeof statusMod?.sku_display_status === "number" ? statusMod.sku_display_status : null
  const statusLabel = statusCode != null ? (SKU_DISPLAY_STATUS[statusCode] ?? "Tidak diketahui") : "Tidak diketahui"

  const delivery = o.delivery_module?.[0]
  const trackingNo = (delivery?.tracking_no || delivery?.last_tracking_no) || null

  const logistic = o.logistics_info_module?.[0]?.logistics_detail_item
  const latestLogistic = logistic?.display_msg
    ? { msg: String(logistic.display_msg), timestamp: num(logistic.timestamp) }
    : null

  const trade = o.trade_order_module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPreOrder = Array.isArray(o.order_label_module) && o.order_label_module.some((l: any) => l?.isPreOrder === 1)

  return {
    orderId: String(o.main_order_id ?? ""),
    statusCode,
    statusLabel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: Array.isArray(o.sku_module) ? o.sku_module.map((s: any) => ({
      name: String(s.product_name ?? ""),
      variant: String(s.sku_name ?? ""),
      qty: num(s.quantity),
      totalPrice: priceVal(s.sku_total_price),
      imageUrl: productImageUrl(s.product_image),
    })) : [],
    courier: delivery?.shipment_provider_info?.name ?? null,
    serviceType: delivery?.logistics_service_info?.logistics_service_name ?? null,
    shippingType: delivery?.logistics_service_info?.logistics_service_level ?? null,
    trackingNo,
    latestLogistic,
    grandTotal: priceVal(o.price_module?.grand_total),
    subTotal: priceVal(o.price_module?.sub_total),
    buyerNickname: o.buyer_info_module?.buyer_nickname ?? null,
    orderDate: trade?.create_time != null ? num(trade.create_time) : null,
    latestRtsTime: trade?.latest_rts_time != null ? num(trade.latest_rts_time) : null,
    payMethod: trade?.pay_method ?? null,
    isPreOrder,
    note: o.note_module?.buyer_note || null,
  }
}
