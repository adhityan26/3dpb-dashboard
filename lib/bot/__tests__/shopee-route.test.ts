import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/orders", () => ({ getOrderDetail: vi.fn() }))
vi.mock("@/lib/shopee/escrow", () => ({ getEscrowDetail: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET } from "@/app/api/bot/shopee/order/[sn]/route"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { requireBotToken } from "@/lib/bot/auth"

const mockDetail = getOrderDetail as any
const mockEscrow = getEscrowDetail as any
const mockAuth = requireBotToken as any
const req = { headers: { get: () => "Bearer x" } } as any
const ctx = (sn: string) => ({ params: Promise.resolve({ sn }) })

const FULL_DETAIL = {
  order_sn: "S1",
  order_status: "READY_TO_SHIP",
  total_amount: 100,
  currency: "IDR",
  create_time: 1700000000,
  update_time: 1700001000,
  ship_by_date: 1700100000,
  days_to_ship: 2,
  shipping_carrier: "SPX Standard",
  payment_method: "COD",
  cod: true,
  message_to_seller: "Tolong bungkus rapi",
  buyer_username: "budi123",
  recipient_address: {
    name: "Budi", phone: "0812xxx", city: "Bandung", district: "Coblong",
    state: "Jawa Barat", zipcode: "40132", full_address: "Jl. Contoh No. 1",
  },
  item_list: [{
    item_name: "Keychain", item_sku: "KC-01", model_name: "Merah", model_sku: "KC-01-RED",
    model_quantity_purchased: 2, model_original_price: 20000, model_discounted_price: 18000,
    image_info: { image_url: "https://example.com/img.jpg" },
  }],
}

const FULL_ESCROW = {
  buyer_payment_amount: 110, escrow_amount: 90,
  commission_fee: 5, service_fee: 2, transaction_fee: 1, actual_shipping_fee: 8,
}

describe("GET /api/bot/shopee/order/[sn]", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(401)
  })

  it("404 when order not found", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(404)
  })

  it("returns the full nested shape with escrow present", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([FULL_DETAIL])
    mockEscrow.mockResolvedValue(FULL_ESCROW)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      orderSn: "S1",
      status: "READY_TO_SHIP",
      total: 100,
      currency: "IDR",
      createTime: 1700000000,
      updateTime: 1700001000,
      shipByDate: 1700100000,
      daysToShip: 2,
      shippingCarrier: "SPX Standard",
      paymentMethod: "COD",
      cod: true,
      messageToSeller: "Tolong bungkus rapi",
      buyer: {
        username: "budi123",
        name: "Budi",
        phone: "0812xxx",
        city: "Bandung",
        district: "Coblong",
        state: "Jawa Barat",
        zip: "40132",
        fullAddress: "Jl. Contoh No. 1",
      },
      items: [{
        name: "Keychain",
        qty: 2,
        sku: "KC-01",
        variant: "Merah",
        variantSku: "KC-01-RED",
        priceOriginal: 20000,
        priceDiscounted: 18000,
        imageUrl: "https://example.com/img.jpg",
      }],
      money: {
        buyerPaid: 110,
        received: 90,
        commissionFee: 5,
        serviceFee: 2,
        transactionFee: 1,
        actualShippingFee: 8,
      },
      url: "https://seller.shopee.co.id/portal/sale/order/S1",
    })
  })

  it("returns null money and omits absent optional order fields gracefully when escrow and optional fields are missing", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{
      order_sn: "S1", order_status: "UNPAID", total_amount: 100, currency: "IDR",
      create_time: 1700000000, update_time: 1700000000, item_list: [],
    }])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body.money).toEqual({
      buyerPaid: null, received: null, commissionFee: null, serviceFee: null, transactionFee: null, actualShippingFee: null,
    })
    expect(body.shippingCarrier).toBeNull()
    expect(body.buyer).toEqual({
      username: null, name: null, phone: null, city: null, district: null, state: null, zip: null, fullAddress: null,
    })
    expect(body.items).toEqual([])
  })
})
