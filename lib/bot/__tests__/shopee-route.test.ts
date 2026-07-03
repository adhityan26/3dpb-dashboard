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

  it("returns order with escrow money", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{
      order_sn: "S1", order_status: "READY_TO_SHIP", total_amount: 100,
      item_list: [{ item_name: "Keychain", model_quantity_purchased: 2 }],
    }])
    mockEscrow.mockResolvedValue({ buyer_payment_amount: 110, escrow_amount: 90 })
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body).toEqual({
      orderSn: "S1", status: "READY_TO_SHIP", total: 100,
      items: [{ name: "Keychain", qty: 2 }],
      buyerPaid: 110, received: 90,
      url: "https://seller.shopee.co.id/portal/sale/order/S1",
    })
  })

  it("returns null money when escrow missing", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{ order_sn: "S1", order_status: "UNPAID", total_amount: 100, item_list: [] }])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body.buyerPaid).toBeNull()
    expect(body.received).toBeNull()
  })
})
