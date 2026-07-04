import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn() }))

import { getOrderDetail } from "@/lib/shopee/orders"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

describe("getOrderDetail", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("requests the enriched field set", async () => {
    mockRequest.mockResolvedValue({ response: { order_list: [] } })
    await getOrderDetail(["S1"])
    const params = mockRequest.mock.calls[0][1]
    const fields = String(params.response_optional_fields).split(",")
    expect(fields).toEqual(expect.arrayContaining([
      "buyer_username", "recipient_address", "item_list", "total_amount",
      "order_status", "create_time", "update_time", "ship_by_date", "days_to_ship",
      "shipping_carrier", "payment_method", "cod", "message_to_seller",
    ]))
  })

  it("returns the order list from the response", async () => {
    const order = { order_sn: "S1", order_status: "READY_TO_SHIP" }
    mockRequest.mockResolvedValue({ response: { order_list: [order] } })
    const result = await getOrderDetail(["S1"])
    expect(result).toEqual([order])
  })

  it("returns an empty array without calling the API for an empty input", async () => {
    const result = await getOrderDetail([])
    expect(result).toEqual([])
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
