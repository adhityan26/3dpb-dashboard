// One WP is created per unit, not per order line: a line with qty 2 becomes two WPs, so
// the packing list and the per-size progress count every ring. The unit key is stable
// across re-fetches, which is what makes creation idempotent.
export interface OrderLine {
  key: string // Shopee line_item_id / Tokopedia sku_id
  productName: string
  variantName: string | null
  qty: number // active quantity (already net of cancelled units)
  unitPrice: number
  productId: string | null
}

export interface OrderUnit {
  itemKey: string
  productName: string
  variantName: string | null
  unitPrice: number
  productId: string | null
}

export function expandOrderUnits(lines: OrderLine[]): OrderUnit[] {
  const seen = new Map<string, number>() // numbering runs per key across the whole order
  const units: OrderUnit[] = []
  for (const l of lines) {
    for (let i = 0; i < Math.max(0, Math.floor(l.qty)); i++) {
      const n = (seen.get(l.key) ?? 0) + 1
      seen.set(l.key, n)
      units.push({ itemKey: `${l.key}#${n}`, productName: l.productName, variantName: l.variantName, unitPrice: l.unitPrice, productId: l.productId })
    }
  }
  return units
}
