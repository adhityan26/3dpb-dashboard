import { describe, it, expect } from "vitest"
import { parseOrder } from "@/lib/tokopedia/parse"

const RAW = {
  main_order_id: "584595347055215631",
  trade_order_module: { pay_method: "BCA VA", create_time: "1783000000", latest_rts_time: 1783200000, payment_time: 1783100000 },
  order_status_module: [{ sku_display_status: 121, main_order_status: 102 }],
  order_label_module: [{ order_line_id: "x", isPreOrder: 1 }],
  sku_module: [
    { product_name: "Kaiju No. 8 Mask", sku_name: "No Damage", quantity: 1, sku_total_price: { price_val: "150000" },
      product_image: { thumb_url_list: ["https://cdn.example/a.jpg", "https://cdn.example/a2.jpg"] } },
    { product_name: "Stand", sku_name: "", quantity: 2, sku_total_price: { price_val: "50000" } },
  ],
  delivery_module: [{
    tracking_no: "JY1030437471",
    shipment_provider_info: { name: "J&T Express" },
    logistics_service_info: { logistics_service_name: "Reguler", logistics_service_level: "Pengiriman Standar" },
  }],
  price_module: { grand_total: { price_val: "556813" }, sub_total: { price_val: "200000" } },
  note_module: { buyer_note: "tolong bungkus rapi" },
  buyer_info_module: { buyer_nickname: "m*******4" },
  logistics_info_module: [{ logistics_detail_item: { display_msg: "Paket tiba di sortir Bandung", timestamp: 1783189245000 } }],
}

describe("parseOrder", () => {
  it("maps the full order to a summary", () => {
    const s = parseOrder(RAW)
    expect(s.orderId).toBe("584595347055215631")
    expect(s.statusCode).toBe(121)
    expect(s.statusLabel).toBe("Dikirim")
    expect(s.products).toEqual([
      { name: "Kaiju No. 8 Mask", variant: "No Damage", qty: 1, totalPrice: 150000, imageUrl: "https://cdn.example/a.jpg" },
      { name: "Stand", variant: "", qty: 2, totalPrice: 50000, imageUrl: null },
    ])
    expect(s.courier).toBe("J&T Express")
    expect(s.serviceType).toBe("Reguler")
    expect(s.shippingType).toBe("Pengiriman Standar")
    expect(s.trackingNo).toBe("JY1030437471")
    expect(s.latestLogistic).toEqual({ msg: "Paket tiba di sortir Bandung", timestamp: 1783189245000 })
    expect(s.grandTotal).toBe(556813)
    expect(s.subTotal).toBe(200000)
    expect(s.buyerNickname).toBe("m*******4")
    expect(s.orderDate).toBe(1783000000)
    expect(s.latestRtsTime).toBe(1783200000)
    expect(s.payMethod).toBe("BCA VA")
    expect(s.isPreOrder).toBe(true)
    expect(s.note).toBe("tolong bungkus rapi")
  })

  it("labels an unknown status code", () => {
    const s = parseOrder({ ...RAW, order_status_module: [{ sku_display_status: 999 }] })
    expect(s.statusCode).toBe(999)
    expect(s.statusLabel).toBe("Tidak diketahui")
  })

  it("handles missing tracking / empty modules gracefully", () => {
    const s = parseOrder({
      main_order_id: "1",
      order_status_module: [],
      sku_module: [],
      delivery_module: [],
      price_module: {},
      logistics_info_module: [],
    })
    expect(s.statusCode).toBeNull()
    expect(s.statusLabel).toBe("Tidak diketahui")
    expect(s.trackingNo).toBeNull()
    expect(s.courier).toBeNull()
    expect(s.latestLogistic).toBeNull()
    expect(s.products).toEqual([])
    expect(s.grandTotal).toBe(0)
    expect(s.buyerNickname).toBeNull()
    expect(s.shippingType).toBeNull()
    expect(s.orderDate).toBeNull()
    expect(s.payMethod).toBeNull()
    expect(s.isPreOrder).toBe(false)
    expect(s.note).toBeNull()
  })

  it("falls back to last_tracking_no when tracking_no is empty", () => {
    const raw = { ...RAW, delivery_module: [{ tracking_no: "", last_tracking_no: "BACKUP1", shipment_provider_info: { name: "JNE" } }] }
    expect(parseOrder(raw).trackingNo).toBe("BACKUP1")
  })
})
