import { describe, it, expect, vi, beforeEach } from "vitest"

const mockShopeeRequest = vi.fn()
vi.mock("@/lib/shopee/client", () => ({
  shopeeRequest: (...args: unknown[]) => mockShopeeRequest(...args),
}))

import { getReturnListForOrders, isReturnFinal } from "../returns"

beforeEach(() => {
  mockShopeeRequest.mockReset()
})

describe("getReturnListForOrders", () => {
  it("filters returns down to the requested order_sns", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: {
        return: [
          { return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 5000 },
          { return_sn: "RT2", order_sn: "ORD_OTHER", status: "REFUND_APPROVED", refund_amount: 3000 },
        ],
        more: false,
      },
    })

    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })

    expect(result).toEqual([
      { return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 5000 },
    ])
  })

  it("paginates when more is true", async () => {
    mockShopeeRequest
      .mockResolvedValueOnce({
        response: {
          return: [{ return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 1000 }],
          more: true,
          next_cursor: "cursor123",
        },
      })
      .mockResolvedValueOnce({
        response: {
          return: [{ return_sn: "RT2", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 500 }],
          more: false,
        },
      })

    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })

    expect(result).toHaveLength(2)
    expect(mockShopeeRequest).toHaveBeenCalledTimes(2)
  })

  it("returns empty array when Shopee API has no returns", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: { return: [], more: false },
    })
    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })
    expect(result).toEqual([])
  })
})

describe("isReturnFinal", () => {
  it("treats REFUND_APPROVED as final", () => {
    expect(isReturnFinal("REFUND_APPROVED")).toBe(true)
  })
  it("treats REQUESTED/PROCESSING as not final", () => {
    expect(isReturnFinal("REQUESTED")).toBe(false)
    expect(isReturnFinal("PROCESSING")).toBe(false)
  })
})
