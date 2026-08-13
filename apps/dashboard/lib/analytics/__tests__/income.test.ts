import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindMany = vi.fn()
const mockUpsert = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: {
    orderEscrow: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}))

const mockGetEscrowDetail = vi.fn()
vi.mock("@/lib/shopee/escrow", () => ({
  getEscrowDetail: (...args: unknown[]) => mockGetEscrowDetail(...args),
}))

const mockGetReturnListForOrders = vi.fn()
vi.mock("@/lib/shopee/returns", () => ({
  getReturnListForOrders: (...args: unknown[]) => mockGetReturnListForOrders(...args),
  isReturnFinal: (status: string) => status === "REFUND_APPROVED",
}))

import { syncAndGetEscrowForOrders, allocateFeePerProduct, MAX_ESCROW_FETCH_PER_REQUEST } from "../income"

const NOW = 1_700_000_000 // fixed reference "now" in seconds

beforeEach(() => {
  mockFindMany.mockReset()
  mockUpsert.mockReset()
  mockGetEscrowDetail.mockReset()
  mockGetReturnListForOrders.mockReset()
})

describe("syncAndGetEscrowForOrders", () => {
  it("fetches escrow for a COMPLETED order missing from cache", async () => {
    mockFindMany.mockResolvedValue([]) // nothing cached
    mockGetEscrowDetail.mockResolvedValue({
      order_sn: "ORD1",
      buyer_payment_amount: 100000,
      escrow_amount: 90000,
      commission_fee: 5000,
      service_fee: 3000,
      transaction_fee: 2000,
      actual_shipping_fee: 0,
    })
    mockUpsert.mockResolvedValue({})

    const orders = [{ order_sn: "ORD1", order_status: "COMPLETED", update_time: NOW - 86400 }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).toHaveBeenCalledWith("ORD1")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderSn: "ORD1" },
        create: expect.objectContaining({ orderSn: "ORD1", escrowAmount: 90000 }),
      }),
    )
    expect(result.get("ORD1")?.escrowAmount).toBe(90000)
  })

  it("skips non-COMPLETED orders entirely", async () => {
    mockFindMany.mockResolvedValue([])
    const orders = [{ order_sn: "ORD2", order_status: "SHIPPING", update_time: NOW }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
    expect(result.has("ORD2")).toBe(false)
  })

  it("does not re-fetch a cached order outside the mutable window", async () => {
    const oldCompleteTime = NOW - 40 * 86400 // 40 days ago, outside 30-day window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD3",
        buyerPaymentAmount: 1,
        escrowAmount: 1,
        commissionFee: 0,
        serviceFee: 0,
        transactionFee: 0,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: oldCompleteTime,
      },
    ])
    const orders = [{ order_sn: "ORD3", order_status: "COMPLETED", update_time: oldCompleteTime }]

    await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetReturnListForOrders).not.toHaveBeenCalled()
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
  })

  it("re-fetches and overwrites when a cached order inside the window has a final return", async () => {
    const recentCompleteTime = NOW - 5 * 86400 // 5 days ago, inside window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD4",
        buyerPaymentAmount: 100000,
        escrowAmount: 90000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: recentCompleteTime,
      },
    ])
    mockGetReturnListForOrders.mockResolvedValue([
      { return_sn: "RT1", order_sn: "ORD4", status: "REFUND_APPROVED", refund_amount: 20000 },
    ])
    mockGetEscrowDetail.mockResolvedValue({
      order_sn: "ORD4",
      buyer_payment_amount: 100000,
      escrow_amount: 70000, // reduced after refund
      commission_fee: 5000,
      service_fee: 3000,
      transaction_fee: 2000,
      actual_shipping_fee: 0,
    })
    mockUpsert.mockResolvedValue({})

    const orders = [{ order_sn: "ORD4", order_status: "COMPLETED", update_time: recentCompleteTime }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).toHaveBeenCalledWith("ORD4")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderSn: "ORD4" },
        create: expect.objectContaining({ escrowAmount: 70000, hasReturnFlag: true }),
      }),
    )
    expect(result.get("ORD4")?.escrowAmount).toBe(70000)
    expect(result.get("ORD4")?.hasReturnFlag).toBe(true)
  })

  it("leaves cached data untouched when return check finds nothing final", async () => {
    const recentCompleteTime = NOW - 5 * 86400
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD5",
        buyerPaymentAmount: 100000,
        escrowAmount: 90000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: recentCompleteTime,
      },
    ])
    mockGetReturnListForOrders.mockResolvedValue([])

    const orders = [{ order_sn: "ORD5", order_status: "COMPLETED", update_time: recentCompleteTime }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
    expect(result.get("ORD5")?.escrowAmount).toBe(90000)
  })

  it("returns both outside-window and inside-window cached orders in mixed batch", async () => {
    const oldCompleteTime = NOW - 40 * 86400 // 40 days ago, outside 30-day window
    const recentCompleteTime = NOW - 5 * 86400 // 5 days ago, inside window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD-OLD",
        buyerPaymentAmount: 100000,
        escrowAmount: 90000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: oldCompleteTime,
      },
      {
        orderSn: "ORD-RECENT",
        buyerPaymentAmount: 200000,
        escrowAmount: 180000,
        commissionFee: 10000,
        serviceFee: 6000,
        transactionFee: 4000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: recentCompleteTime,
      },
    ])
    mockGetReturnListForOrders.mockResolvedValue([]) // no final returns

    const orders = [
      { order_sn: "ORD-OLD", order_status: "COMPLETED", update_time: oldCompleteTime },
      { order_sn: "ORD-RECENT", order_status: "COMPLETED", update_time: recentCompleteTime },
    ]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    // Both should be present in the result with original cached values
    expect(result.has("ORD-OLD")).toBe(true)
    expect(result.get("ORD-OLD")?.escrowAmount).toBe(90000)
    expect(result.has("ORD-RECENT")).toBe(true)
    expect(result.get("ORD-RECENT")?.escrowAmount).toBe(180000)

    // getReturnListForOrders should be called (for the in-window order only)
    expect(mockGetReturnListForOrders).toHaveBeenCalled()
    // getEscrowDetail should NOT be called for either (no new fetches needed)
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
  })

  it("skips re-checking returns/escrow for orders already flagged hasReturnFlag", async () => {
    const recentCompleteTime = NOW - 5 * 86400 // inside window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD6",
        buyerPaymentAmount: 100000,
        escrowAmount: 70000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: true, // already reconciled once before
        orderCompleteTime: recentCompleteTime,
      },
    ])

    const orders = [{ order_sn: "ORD6", order_status: "COMPLETED", update_time: recentCompleteTime }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetReturnListForOrders).not.toHaveBeenCalled()
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
    expect(result.get("ORD6")).toEqual({
      orderSn: "ORD6",
      buyerPaymentAmount: 100000,
      escrowAmount: 70000,
      commissionFee: 5000,
      serviceFee: 3000,
      transactionFee: 2000,
      actualShippingFee: 0,
      hasReturnFlag: true,
    })
  })

  it("caps stage-1 escrow fetch to MAX_ESCROW_FETCH_PER_REQUEST when cache is cold", async () => {
    mockFindMany.mockResolvedValue([]) // nothing cached
    mockGetEscrowDetail.mockResolvedValue({
      order_sn: "X",
      buyer_payment_amount: 1000,
      escrow_amount: 900,
      commission_fee: 50,
      service_fee: 30,
      transaction_fee: 20,
      actual_shipping_fee: 0,
    })
    mockUpsert.mockResolvedValue({})

    const total = MAX_ESCROW_FETCH_PER_REQUEST + 20
    const orders = Array.from({ length: total }, (_, i) => ({
      order_sn: `ORD-${i}`,
      order_status: "COMPLETED",
      update_time: NOW - 86400,
    }))

    await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).toHaveBeenCalledTimes(MAX_ESCROW_FETCH_PER_REQUEST)
  })
})

describe("allocateFeePerProduct", () => {
  it("allocates fees proportionally by item revenue share", () => {
    const escrowByOrderSn = new Map([
      [
        "ORD1",
        {
          orderSn: "ORD1",
          buyerPaymentAmount: 100000,
          escrowAmount: 90000,
          commissionFee: 6000,
          serviceFee: 3000,
          transactionFee: 1000,
          actualShippingFee: 0,
          hasReturnFlag: false,
        },
      ],
    ])
    const orders = [
      {
        order_sn: "ORD1",
        total_amount: 100000,
        item_list: [
          { item_id: 1, item_name: "Produk A", model_quantity_purchased: 1, model_discounted_price: 75000 },
          { item_id: 2, item_name: "Produk B", model_quantity_purchased: 1, model_discounted_price: 25000 },
        ],
      },
    ]

    const result = allocateFeePerProduct(orders, escrowByOrderSn)
    const lines = result.get("ORD1")!

    // Total fee = 10000, split 75/25
    expect(lines.find((l) => l.productName === "Produk A")?.adminFee).toBeCloseTo(7500)
    expect(lines.find((l) => l.productName === "Produk B")?.adminFee).toBeCloseTo(2500)
    // buyerPaymentAmount = 100000, split 75/25 same as fee share
    expect(lines.find((l) => l.productName === "Produk A")?.buyerPayment).toBeCloseTo(75000)
    expect(lines.find((l) => l.productName === "Produk B")?.buyerPayment).toBeCloseTo(25000)
  })

  it("returns null adminFee/received/buyerPayment for orders with no escrow entry", () => {
    const orders = [
      {
        order_sn: "ORD2",
        total_amount: 50000,
        item_list: [
          { item_id: 1, item_name: "Produk C", model_quantity_purchased: 1, model_discounted_price: 50000 },
        ],
      },
    ]
    const result = allocateFeePerProduct(orders, new Map())
    const lines = result.get("ORD2")!
    expect(lines[0].adminFee).toBeNull()
    expect(lines[0].received).toBeNull()
    expect(lines[0].buyerPayment).toBeNull()
  })
})
