import { describe, it, expect } from "vitest"
import { generateMockAnalytics } from "../mock"

describe("generateMockAnalytics", () => {
  it("includes a non-empty income breakdown consistent with topProducts", () => {
    const data = generateMockAnalytics("2026-08-01", "2026-08-07")

    expect(data.incomeSummary.totalBuyerPayment).toBeGreaterThan(0)
    expect(data.incomeSummary.totalShopeePrice).toBeGreaterThan(0)
    expect(data.incomeSummary.completedOrderCount).toBeGreaterThan(0)
    expect(data.incomeByProduct.length).toBe(data.topProducts.length)

    for (const p of data.incomeByProduct) {
      expect(p.adminFee).not.toBeNull()
      expect(p.received).not.toBeNull()
      expect(p.received!).toBeLessThan(p.buyerPayment)
    }
  })
})
