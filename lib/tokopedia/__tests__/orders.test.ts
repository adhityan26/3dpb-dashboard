import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/tokopedia/client", () => ({ tokopediaRequest: vi.fn() }))

import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { tokopediaRequest } from "@/lib/tokopedia/client"

const mockReq = tokopediaRequest as any

describe("listOrders", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the perlu-dikirim filter (order_status 1 + search_tab 101, sort 11)", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("perlu-dikirim")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.order_status.value).toEqual(["1"])
    expect(body.search_condition.condition_list.search_tab.value).toEqual(["101"])
    expect(body.sort_info).toBe("11")
    expect(body.count).toBe(20)
  })

  it("sends the dikirim filter (search_tab 102, no order_status, sort 6)", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("dikirim")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.search_tab.value).toEqual(["102"])
    expect(body.search_condition.condition_list.order_status).toBeUndefined()
    expect(body.sort_info).toBe("6")
  })

  it("sends the selesai filter (search_tab 103, sort 6)", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("selesai")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.search_tab.value).toEqual(["103"])
    expect(body.sort_info).toBe("6")
  })

  it("honors count/offset overrides", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("perlu-dikirim", { count: 5, offset: 40 })
    const body = mockReq.mock.calls[0][0]
    expect(body.count).toBe(5)
    expect(body.offset).toBe(40)
  })
})

describe("getOrderById", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the main_order_id filter and returns the first order", async () => {
    mockReq.mockResolvedValue({ total_count: 1, main_orders: [{ main_order_id: "X" }] })
    const order = await getOrderById("X")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.main_order_id.value).toEqual(["X"])
    expect(order).toEqual({ main_order_id: "X" })
  })

  it("returns null when no order matches", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    expect(await getOrderById("X")).toBeNull()
  })
})
