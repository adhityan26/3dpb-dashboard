import type { WorkingProject } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, isGLRing, resolveVariantEntrySize } from './format'

export type ProductBucket = 'gl2026' | 'cosplay' | 'lainnya'

// Real production product names ("Green Lantern Ring 2026 3D Print" vs
// "3D Print Green Lantern Ring Cosplay") are distinguished by these two
// tokens — checked in this order since a name could in principle carry
// both, though that hasn't happened in practice.
export function detectProductBucket(product: string): ProductBucket {
  if (/2026/.test(product)) return 'gl2026'
  if (/cosplay/i.test(product)) return 'cosplay'
  return 'lainnya'
}

export interface ShippingScheduleRow {
  wpId: string
  key: string
  customer: string
  orderNo: string
  dueDate: string | null
  status: string
  usSize: string | null
  bucket: ProductBucket
  shipping: string | null
}

// Same per-variant expansion as WorkingProjectGLRingTab's expandToRows
// (notes-over-variant size precedence, one row per ring variant on a
// multi-variant order) — kept as its own copy here rather than shared,
// since this view drops fields (scale%, checklist) the GL Ring tab needs
// and would otherwise need to thread through unused.
export function buildShippingScheduleRows(
  projects: WorkingProject[],
  configuredProductIds: string[],
): ShippingScheduleRow[] {
  const rows: ShippingScheduleRow[] = []
  for (const wp of projects) {
    if (!isGLRing(wp.appliedTags ?? [], wp.forumChannelId, wp.product, wp.sourceProductId, configuredProductIds)) continue
    const variants = splitProductVariants(wp.product)
    variants.forEach((entry) => {
      const key = variantShort(entry)
      const { usSize } = resolveVariantEntrySize({ entry, key, notes: wp.notes ?? null, variant: wp.variant ?? null, variantCount: variants.length })
      rows.push({
        wpId: wp.id,
        key,
        customer: wp.customer,
        orderNo: wp.sourceOrderNo ?? wp.orderNoLegacy ?? '-',
        dueDate: wp.dueDate,
        status: wp.status,
        usSize,
        // Per-entry, not per-whole-product-string — an order mixing a GL
        // 2026 item with a Cosplay item in one WP would otherwise have both
        // entries resolve to whichever token wp.product's full joined text
        // happened to contain first (found 2026-09-28 alongside the
        // multi-item creation bug this fixes).
        bucket: detectProductBucket(entry),
        shipping: wp.shipping ?? null,
      })
    })
  }
  return rows
}
