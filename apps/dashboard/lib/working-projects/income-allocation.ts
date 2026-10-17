export interface OrderIncomeTotals { salePrice: number; feesTotal: number; netIncome: number }

// Splits an order's income over its WPs. Sale price and fees are both allocated from the
// ORDER totals (item prices are only the weights), so the parts always add back to the
// order even when the lines don't sum to the order's sale price (vouchers, subsidies).
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map((w) => (sum > 0 ? Math.floor((total * w) / sum) : Math.floor(total / weights.length)))
  shares[shares.length - 1] += total - shares.reduce((a, b) => a + b, 0)
  return shares
}

export function allocateOrderIncome(order: OrderIncomeTotals, weights: number[]): OrderIncomeTotals[] {
  if (weights.length === 0) return []
  const sale = split(order.salePrice, weights)
  const fees = split(order.feesTotal, weights)
  return weights.map((_, i) => ({ salePrice: sale[i], feesTotal: fees[i], netIncome: sale[i] - fees[i] }))
}
