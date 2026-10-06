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

export function orderLinesFromShopee(items: { lineItemId: number | null; itemId: number; modelId: number | null; productName: string; variantName: string | null; qty: number; cancelledQty: number; unitPrice: number }[]): OrderLine[] {
  return items.map((it) => ({
    key: it.lineItemId != null ? String(it.lineItemId) : `${it.itemId}:${it.modelId ?? 0}`,
    productName: it.productName,
    variantName: it.variantName,
    qty: it.qty - it.cancelledQty,
    unitPrice: it.unitPrice,
    productId: String(it.itemId),
  }))
}

export function orderLinesFromTokopedia(products: { skuId: string; productId: string; name: string; variant: string; qty: number; unitPrice: number }[]): OrderLine[] {
  // An empty sku_id would make a bare "" key (and "#1" unit keys); fall back to a stable product-derived key.
  return products.map((p) => ({ key: p.skuId || `${p.productId || 'p'}:${p.name}:${p.variant}`, productName: p.name, variantName: p.variant || null, qty: p.qty, unitPrice: p.unitPrice, productId: p.productId || null }))
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

// Validates untrusted `units` from an API body before they reach createWorkingProjectsForOrder.
export function validateOrderUnits(input: unknown): { ok: true; units: OrderUnit[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'units tidak valid: harus array tidak kosong' }
  const seen = new Set<string>()
  const units: OrderUnit[] = []
  for (let i = 0; i < input.length; i++) {
    const u = input[i] as Record<string, unknown> | null
    const at = `units[${i}]`
    if (!u || typeof u !== 'object') return { ok: false, error: `units tidak valid: ${at} bukan objek` }
    if (!isStr(u.itemKey)) return { ok: false, error: `units tidak valid: ${at}.itemKey wajib string` }
    if (!isStr(u.productName)) return { ok: false, error: `units tidak valid: ${at}.productName wajib string` }
    if (u.variantName != null && typeof u.variantName !== 'string') return { ok: false, error: `units tidak valid: ${at}.variantName harus string/null` }
    if (typeof u.unitPrice !== 'number' || !Number.isFinite(u.unitPrice) || u.unitPrice < 0) return { ok: false, error: `units tidak valid: ${at}.unitPrice harus angka >= 0` }
    if (u.productId != null && typeof u.productId !== 'string') return { ok: false, error: `units tidak valid: ${at}.productId harus string/null` }
    if (seen.has(u.itemKey)) return { ok: false, error: `units tidak valid: itemKey duplikat "${u.itemKey}"` }
    seen.add(u.itemKey)
    units.push({ itemKey: u.itemKey, productName: u.productName, variantName: (u.variantName as string | null | undefined) ?? null, unitPrice: u.unitPrice, productId: (u.productId as string | null | undefined) ?? null })
  }
  return { ok: true, units }
}
