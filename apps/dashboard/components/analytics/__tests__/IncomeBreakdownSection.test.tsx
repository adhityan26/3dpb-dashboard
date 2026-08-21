import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { IncomeBreakdownSection } from "../IncomeBreakdownSection"
import type { IncomeBreakdownSummary, ProductIncomeBreakdown } from "@/lib/analytics/types"

const summary: IncomeBreakdownSummary = {
  totalBuyerPayment: 100000,
  totalShopeePrice: 100000,
  totalAdminFee: 10000,
  totalReceived: 90000,
  completedOrderCount: 1,
  totalOrderCount: 2,
}

const products: ProductIncomeBreakdown[] = [
  {
    productName: "Produk A",
    qty: 1,
    buyerPayment: 100000,
    shopeePrice: 100000,
    adminFee: 10000,
    received: 90000,
    hasReturn: true,
  },
  {
    productName: "Produk B (belum final)",
    qty: 1,
    buyerPayment: 50000,
    shopeePrice: 50000,
    adminFee: null,
    received: null,
    hasReturn: false,
  },
]

describe("IncomeBreakdownSection", () => {
  it("renders summary totals and coverage count", () => {
    const html = renderToStaticMarkup(<IncomeBreakdownSection summary={summary} products={products} />)
    expect(html).toContain("1 dari 2")
  })

  it("marks not-final rows and return-flagged rows", () => {
    const html = renderToStaticMarkup(<IncomeBreakdownSection summary={summary} products={products} />)
    expect(html).toContain("Produk A")
    expect(html).toContain("Ada refund")
    expect(html).toContain("Produk B (belum final)")
    expect(html).toContain("Belum final")
  })
})
