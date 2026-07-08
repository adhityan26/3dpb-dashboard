import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/tokopedia/session", () => ({ saveSession: vi.fn(), getSessionStatus: vi.fn() }))
vi.mock("@/lib/tokopedia/orders", () => ({ listOrders: vi.fn(), getOrderById: vi.fn() }))
vi.mock("@/lib/tokopedia/parse", () => ({ parseOrder: vi.fn((o) => ({ orderId: o.main_order_id })) }))

import { POST as sessionPOST, GET as sessionGET } from "@/app/api/tokopedia/session/route"
import { POST as testPOST } from "@/app/api/tokopedia/session/test/route"
import { GET as ordersGET } from "@/app/api/tokopedia/orders/route"
import { GET as orderGET } from "@/app/api/tokopedia/orders/[id]/route"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"
import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockAuth = auth as any
const mockSave = saveSession as any
const mockStatus = getSessionStatus as any
const mockList = listOrders as any
const mockById = getOrderById as any
const authed = () => mockAuth.mockResolvedValue({ user: { email: "a@b.c" } })
const reqJson = (body: unknown, url = "http://x/api/tokopedia/orders") =>
  ({ json: async () => body, url } as any)

describe("dashboard tokopedia routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("session POST 401 without auth", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await sessionPOST(reqJson({ cookies: [] }))
    expect(res.status).toBe(401)
  })

  it("session POST saves and returns meta", async () => {
    authed()
    mockSave.mockResolvedValue({ sellerId: "S1", appId: "4068", updatedAt: "u", tokenExpiry: "e" })
    const res = await sessionPOST(reqJson({ cookies: [{ name: "SELLER_TOKEN", value: "x" }] }))
    expect(res.status).toBe(200)
    expect((await res.json()).sellerId).toBe("S1")
  })

  it("session GET returns status", async () => {
    authed()
    mockStatus.mockResolvedValue({ exists: true, sellerId: "S1", expired: false })
    const res = await sessionGET(reqJson({}))
    expect((await res.json()).sellerId).toBe("S1")
  })

  it("session test returns ok:false with error code on session failure", async () => {
    authed()
    mockList.mockRejectedValue(new TokopediaError("SESSION_INVALID"))
    const res = await testPOST(reqJson({}))
    expect(await res.json()).toEqual({ ok: false, error: "SESSION_INVALID" })
  })

  it("session test returns ok:true on success", async () => {
    authed()
    mockList.mockResolvedValue({ total_count: 0, main_orders: [] })
    const res = await testPOST(reqJson({}))
    expect(await res.json()).toEqual({ ok: true })
  })

  it("orders GET parses and returns summaries", async () => {
    authed()
    mockList.mockResolvedValue({ total_count: 1, main_orders: [{ main_order_id: "O1" }] })
    const res = await ordersGET(reqJson({}, "http://x/api/tokopedia/orders?tab=perlu-dikirim"))
    const body = await res.json()
    expect(body.totalCount).toBe(1)
    expect(body.orders[0].orderId).toBe("O1")
    expect(mockList.mock.calls[0][0]).toBe("perlu-dikirim")
  })

  it("orders GET maps session error to 409", async () => {
    authed()
    mockList.mockRejectedValue(new TokopediaError("SESSION_MISSING"))
    const res = await ordersGET(reqJson({}, "http://x/api/tokopedia/orders?tab=semua"))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("SESSION_MISSING")
  })

  it("order-by-id 404 when null", async () => {
    authed()
    mockById.mockResolvedValue(null)
    const res = await orderGET(reqJson({}), { params: Promise.resolve({ id: "X" }) })
    expect(res.status).toBe(404)
  })

  it("order-by-id returns the parsed order", async () => {
    authed()
    mockById.mockResolvedValue({ main_order_id: "X" })
    const res = await orderGET(reqJson({}), { params: Promise.resolve({ id: "X" }) })
    expect((await res.json()).orderId).toBe("X")
  })
})
