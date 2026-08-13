import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    productHpp: { findMany: vi.fn().mockResolvedValue([]) },
    variantHpp: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const mockGetOrdersInRange = vi.fn()
vi.mock("@/lib/orders/service", () => ({
  getOrdersInRange: (...args: unknown[]) => mockGetOrdersInRange(...args),
}))

vi.mock("@/lib/shopee/ads", () => ({
  getAllAdsDailyPerformance: vi.fn().mockResolvedValue([]),
}))

const mockSyncAndGetEscrowForOrders = vi.fn()
const mockAllocateFeePerProduct = vi.fn()
vi.mock("@/lib/analytics/income", () => ({
  syncAndGetEscrowForOrders: (...args: unknown[]) => mockSyncAndGetEscrowForOrders(...args),
  allocateFeePerProduct: (...args: unknown[]) => mockAllocateFeePerProduct(...args),
}))

import { getAnalytics } from "../service"

beforeEach(() => {
  mockGetOrdersInRange.mockReset()
  mockSyncAndGetEscrowForOrders.mockReset()
  mockAllocateFeePerProduct.mockReset()
  process.env.SHOPEE_MOCK_ANALYTICS = "false"
})

describe("getAnalytics income breakdown", () => {
  it("aggregates incomeSummary and incomeByProduct from synced escrow", async () => {
    const order = {
      order_sn: "ORD1",
      order_status: "COMPLETED",
      create_time: Math.floor(Date.now() / 1000) - 3600,
      update_time: Math.floor(Date.now() / 1000) - 3600,
      total_amount: 100000,
      item_list: [
        { item_id: 1, item_name: "Produk A", model_quantity_purchased: 1, model_discounted_price: 100000 },
      ],
    }
    mockGetOrdersInRange.mockResolvedValue([order])

    const escrowRow = {
      orderSn: "ORD1",
      buyerPaymentAmount: 100000,
      escrowAmount: 90000,
      commissionFee: 6000,
      serviceFee: 3000,
      transactionFee: 1000,
      actualShippingFee: 0,
      hasReturnFlag: false,
    }
    mockSyncAndGetEscrowForOrders.mockResolvedValue(new Map([["ORD1", escrowRow]]))
    mockAllocateFeePerProduct.mockReturnValue(
      new Map([
        [
          "ORD1",
          [{ productName: "Produk A", adminFee: 10000, received: 90000, hasReturn: false }],
        ],
      ]),
    )

    const result = await getAnalytics("7d")

    expect(result.incomeSummary).toEqual({
      totalBuyerPayment: 100000,
      totalShopeePrice: 100000,
      totalAdminFee: 10000,
      totalReceived: 90000,
      completedOrderCount: 1,
      totalOrderCount: 1,
    })
    expect(result.incomeByProduct).toEqual([
      {
        productName: "Produk A",
        qty: 1,
        buyerPayment: 100000,
        shopeePrice: 100000,
        adminFee: 10000,
        received: 90000,
        hasReturn: false,
      },
    ])
  })

  it("marks non-completed order products as not-final (null fee/received)", async () => {
    const order = {
      order_sn: "ORD2",
      order_status: "SHIPPING",
      create_time: Math.floor(Date.now() / 1000) - 3600,
      update_time: Math.floor(Date.now() / 1000) - 3600,
      total_amount: 50000,
      item_list: [
        { item_id: 2, item_name: "Produk B", model_quantity_purchased: 1, model_discounted_price: 50000 },
      ],
    }
    mockGetOrdersInRange.mockResolvedValue([order])
    mockSyncAndGetEscrowForOrders.mockResolvedValue(new Map())
    mockAllocateFeePerProduct.mockReturnValue(
      new Map([["ORD2", [{ productName: "Produk B", adminFee: null, received: null, hasReturn: false }]]]),
    )

    const result = await getAnalytics("7d")

    expect(result.incomeByProduct[0]).toEqual({
      productName: "Produk B",
      qty: 1,
      buyerPayment: 50000,
      shopeePrice: 50000,
      adminFee: null,
      received: null,
      hasReturn: false,
    })
    expect(result.incomeSummary.completedOrderCount).toBe(0)
    expect(result.incomeSummary.totalOrderCount).toBe(1)
  })
})
