import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))
vi.mock("@/lib/tokopedia/orders", () => ({ listOrders: vi.fn(), getOrderById: vi.fn() }))

import { GET as listGET } from "@/app/api/bot/tokopedia/orders/route"
import { GET as byIdGET } from "@/app/api/bot/tokopedia/orders/[id]/route"
import { requireBotToken } from "@/lib/bot/auth"
import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockAuth = requireBotToken as any
const mockList = listOrders as any
const mockById = getOrderById as any
const req = (url = "http://x/api/bot/tokopedia/orders") => ({ headers: { get: () => "Bearer x" }, url } as any)

describe("bot tokopedia routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("list 401 without token", async () => {
    mockAuth.mockReturnValue(false)
    const res = await listGET(req())
    expect(res.status).toBe(401)
  })

  it("list returns raw data passthrough", async () => {
    mockAuth.mockReturnValue(true)
    mockList.mockResolvedValue({ total_count: 2, main_orders: [{ main_order_id: "A" }] })
    const res = await listGET(req("http://x/api/bot/tokopedia/orders?tab=dikirim"))
    const body = await res.json()
    expect(body).toEqual({ ok: true, data: { total_count: 2, main_orders: [{ main_order_id: "A" }] } })
    expect(mockList.mock.calls[0][0]).toBe("dikirim")
  })

  it("list returns ok:false with session error code", async () => {
    mockAuth.mockReturnValue(true)
    mockList.mockRejectedValue(new TokopediaError("SESSION_INVALID"))
    const res = await listGET(req())
    expect(await res.json()).toEqual({ ok: false, error: "SESSION_INVALID" })
  })

  it("by-id returns raw order", async () => {
    mockAuth.mockReturnValue(true)
    mockById.mockResolvedValue({ main_order_id: "X" })
    const res = await byIdGET(req(), { params: Promise.resolve({ id: "X" }) })
    expect(await res.json()).toEqual({ ok: true, data: { main_order_id: "X" } })
  })

  it("by-id returns not_found", async () => {
    mockAuth.mockReturnValue(true)
    mockById.mockResolvedValue(null)
    const res = await byIdGET(req(), { params: Promise.resolve({ id: "X" }) })
    expect(await res.json()).toEqual({ ok: false, error: "not_found" })
  })
})
