// Pure planner for backfilling MarketplaceOrder parents of legacy Working
// Projects. It only looks at WP data (no marketplace calls) and is idempotent.
export type MarketplaceSource = 'shopee' | 'tokopedia'

export interface BackfillWp {
  id: string
  source: string
  sourceOrderNo: string | null
  orderId: string | null
  quotationId: string | null
}

export interface BackfillPlan {
  newOrders: { source: MarketplaceSource; sourceOrderNo: string; quotationId: string | null }[]
  links: { wpId: string; source: MarketplaceSource; sourceOrderNo: string }[]
  quotationUpdates: { source: MarketplaceSource; sourceOrderNo: string; quotationId: string }[]
  quotationConflicts: { source: string; sourceOrderNo: string; quotationIds: string[] }[]
  // An existing order already holds a quotationId that differs from a WP's own one (never overwritten).
  quotationMismatches: { source: string; sourceOrderNo: string; wpId: string; wpQuotationId: string; orderQuotationId: string }[]
  skipped: number
}

export function planOrderBackfill(
  wps: BackfillWp[],
  existingOrders: { source: string; sourceOrderNo: string; quotationId: string | null }[],
): BackfillPlan {
  const plan: BackfillPlan = { newOrders: [], links: [], quotationUpdates: [], quotationConflicts: [], quotationMismatches: [], skipped: 0 }
  const existing = new Map(existingOrders.map((o) => [`${o.source}:${o.sourceOrderNo}`, o]))
  const groups = new Map<string, { source: MarketplaceSource; sourceOrderNo: string; wps: BackfillWp[] }>()

  for (const w of wps) {
    if ((w.source !== 'shopee' && w.source !== 'tokopedia') || !w.sourceOrderNo || w.orderId) {
      plan.skipped++
      continue
    }
    const key = `${w.source}:${w.sourceOrderNo}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { source: w.source, sourceOrderNo: w.sourceOrderNo, wps: [] }))
    g.wps.push(w)
  }

  for (const [key, g] of groups) {
    const quotationIds = [...new Set(g.wps.map((w) => w.quotationId).filter((q): q is string => !!q))]
    const conflict = quotationIds.length > 1
    const quotationId = quotationIds.length === 1 ? quotationIds[0] : null
    if (conflict) plan.quotationConflicts.push({ source: g.source, sourceOrderNo: g.sourceOrderNo, quotationIds })

    const order = existing.get(key)
    if (!order) {
      plan.newOrders.push({ source: g.source, sourceOrderNo: g.sourceOrderNo, quotationId })
    } else if (!order.quotationId && quotationId) {
      plan.quotationUpdates.push({ source: g.source, sourceOrderNo: g.sourceOrderNo, quotationId })
    }
    if (order?.quotationId) {
      for (const w of g.wps) {
        if (w.quotationId && w.quotationId !== order.quotationId) {
          plan.quotationMismatches.push({ source: g.source, sourceOrderNo: g.sourceOrderNo, wpId: w.id, wpQuotationId: w.quotationId, orderQuotationId: order.quotationId })
        }
      }
    }
    for (const w of g.wps) plan.links.push({ wpId: w.id, source: g.source, sourceOrderNo: g.sourceOrderNo })
  }
  return plan
}
