import type { WorkingProject } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, isGLRing, resolveVariantEntrySize } from './format'
import { detectProductCategory, type ProductCategory, type CategoryProductIds } from './category'
import { isFastCourier } from './courier'

export type ScheduleCategory = ProductCategory | 'general'

export type ShippingTableRowBy = 'variant' | 'produk'

export interface ShippingTableGroup {
  title: string
  keywords: string[]
  // 'variant' = one row per resolved size/variant (e.g. ring sizes) — use
  // when the group's keywords already narrow it down to one physical
  // product. 'produk' = one row per "product · variant" instead, since a
  // group whose keywords match several different products needs the
  // product name in the row to avoid unrelated products' rows colliding
  // (e.g. two different items both having a "Hitam" variant).
  rowBy: ShippingTableRowBy
}

// Checked top-to-bottom, first matching keyword wins — Cosplay must come
// before the generic GL keyword so a Cosplay listing's "GL Ring Cosplay"
// name doesn't get grabbed by the broader "gl" match first. A product
// matching none of these groups falls into the "General" table instead
// (see resolveShippingTableGroup below) — General itself isn't configurable.
export const DEFAULT_SHIPPING_TABLE_GROUPS: ShippingTableGroup[] = [
  { title: 'GL Ring Cosplay', keywords: ['cosplay'], rowBy: 'variant' },
  { title: 'GL Ring 2026', keywords: ['gl', 'green lantern'], rowBy: 'variant' },
]

export const GENERAL_TABLE_TITLE = 'General'

export interface ShippingScheduleRow {
  wpId: string
  orderNo: string
  platform: string | null
  customer: string
  product: string // variantShort(entry) — short display name for this line item
  category: ScheduleCategory
  size: string | null // resolved US size — only meaningful for 'cincin', but populated whenever resolveVariantEntrySize finds one
  variantLabel: string | null // raw marketplace variant text (color, etc.) for any category
  dueDate: string | null
  priority: 'cepat' | 'reguler'
  shipping: string | null
  status: string
  itemIndex: number // 1-based position of this line item within its WP
  itemCount: number // total line items on this WP (>1 = multi-item order)
}

// For a multi-item WP, buildMultiItemProduct() (format.ts) embeds each
// item's raw variant as a trailing "(...)" on the entry — e.g.
// "Crocs Charm Jibbitz (Galaxy Pearl,Kiri)". Pull that back out for the
// Varian column. Single-item WPs keep their variant in the separate
// `variant` field instead (never embedded in the product name), so this
// only ever fires for variantCount > 1.
function extractEmbeddedVariant(entry: string): string | null {
  const m = entry.match(/\(([^()]+)\)\s*$/)
  return m ? m[1].trim() : null
}

/**
 * Which category a single line-item `entry` belongs to. Reuses
 * detectProductCategory() (the same categorization auto-create routes
 * Discord threads with) so this view and the forum routing never drift
 * apart into two separate category systems.
 *
 * `sourceProductId` is WP-level, not per-item — on a multi-item WP it can't
 * be trusted to identify any ONE of several items, so it's only passed
 * through when the WP has exactly one item (variantCount === 1).
 *
 * Falls back to isGLRing()'s legacy signals (appliedTags, forumChannelId)
 * when the category regex/ID list finds nothing — older WPs created before
 * this categorization existed relied on those instead.
 */
export function detectRowCategory(input: {
  entry: string
  wp: Pick<WorkingProject, 'appliedTags' | 'forumChannelId' | 'sourceProductId'>
  variantCount: number
  configuredProductIds: CategoryProductIds
}): ScheduleCategory {
  const category = detectProductCategory({
    product: input.entry,
    sourceProductId: input.variantCount === 1 ? input.wp.sourceProductId : null,
    configuredProductIds: input.configuredProductIds,
  })
  if (category) return category
  if (isGLRing(input.wp.appliedTags ?? [], input.wp.forumChannelId, input.entry, null, input.configuredProductIds.cincin)) {
    return 'cincin'
  }
  return 'general'
}

/**
 * One row per line item across ALL Working Projects (not just GL Ring) —
 * a WP with several items (including two of the same product at different
 * sizes) produces one row per item, reusing the same notes > embedded-size >
 * variant-field precedence WorkingProjectGLRingTab.tsx uses.
 */
export function buildShippingScheduleRows(
  projects: WorkingProject[],
  configuredProductIds: CategoryProductIds,
  fastCouriers: string[],
): ShippingScheduleRow[] {
  const rows: ShippingScheduleRow[] = []
  for (const wp of projects) {
    const entries = splitProductVariants(wp.product)
    const priority: ShippingScheduleRow['priority'] = isFastCourier(wp.shipping, fastCouriers) ? 'cepat' : 'reguler'
    entries.forEach((entry, i) => {
      const key = variantShort(entry)
      const { usSize } = resolveVariantEntrySize({ entry, key, notes: wp.notes ?? null, variant: wp.variant ?? null, variantCount: entries.length })
      const variantLabel = entries.length > 1 ? extractEmbeddedVariant(entry) : (wp.variant?.trim() || null)
      rows.push({
        wpId: wp.id,
        orderNo: wp.sourceOrderNo ?? wp.orderNoLegacy ?? '-',
        platform: wp.platform,
        customer: wp.customer,
        product: key,
        category: detectRowCategory({ entry, wp, variantCount: entries.length, configuredProductIds }),
        size: usSize,
        variantLabel,
        dueDate: wp.dueDate,
        priority,
        shipping: wp.shipping ?? null,
        status: wp.status,
        itemIndex: i + 1,
        itemCount: entries.length,
      })
    })
  }
  return rows
}

export const NO_DUE_DATE_COLUMN = 'no-date'

/**
 * Which user-configured group a product falls into, per the user-maintained
 * table list (Settings > Jadwal Kirim, see ShippingTableGroup in
 * service.ts) — replaces the old fixed Cincin/Topeng/Clicker/General
 * category-to-table mapping (2026-09-29): tables are now entirely
 * user-defined, independent of the auto-create category, so any product can
 * be grouped into any table by keyword. A product matching no group's
 * keywords falls into the always-present "General" table instead.
 *
 * `groups` is checked top-to-bottom, first matching keyword (case-
 * insensitive substring against the row's short product name) wins — lets
 * a narrower group (e.g. "Cosplay") be listed before a broader one (e.g.
 * "gl"/"green lantern") so a Cosplay listing's own "GL Ring Cosplay" name
 * doesn't get grabbed by the broader group first.
 */
export function resolveShippingTableGroup(product: string, groups: ShippingTableGroup[]): ShippingTableGroup | null {
  const lower = product.toLowerCase()
  for (const group of groups) {
    if (group.keywords.some((k) => k.trim() && lower.includes(k.trim().toLowerCase()))) return group
  }
  return null
}

/**
 * One keyword assigned to two different groups would make that product's
 * table membership order-dependent (whichever group happens to come first
 * wins) rather than an explicit choice — the constraint the Settings UI
 * enforces ("1 produk hanya bisa 1 table"). Returns the first conflicting
 * keyword found, or null when every keyword belongs to at most one group.
 * Comparison is case-insensitive/trimmed, matching resolveShippingTableGroup.
 */
export function findDuplicateShippingKeyword(groups: ShippingTableGroup[]): string | null {
  const seen = new Map<string, string>() // normalized keyword -> group title that claimed it first
  for (const group of groups) {
    for (const raw of group.keywords) {
      const k = raw.trim().toLowerCase()
      if (!k) continue
      const claimedBy = seen.get(k)
      if (claimedBy && claimedBy !== group.title) return raw
      seen.set(k, group.title)
    }
  }
  return null
}

export function pivotTableKeyFor(row: ShippingScheduleRow, groups: ShippingTableGroup[]): { key: string; title: string; rowBy: ShippingTableRowBy } {
  const group = resolveShippingTableGroup(row.product, groups)
  if (group) return { key: `table:${group.title}`, title: group.title, rowBy: group.rowBy }
  return { key: 'general', title: GENERAL_TABLE_TITLE, rowBy: 'produk' }
}

/**
 * The row-grouping label within a pivot table, per the table's configured
 * `rowBy`: 'variant' shows just the resolved size/variant (a table whose
 * keywords already narrow it to one physical product), 'produk' prefixes
 * the product name too — needed when a table's keywords match several
 * different products, since the variant alone can collide across them
 * ("Hitam" on two different custom items would otherwise merge into one
 * row, found in Opus review 2026-09-29).
 */
export function pivotRowLabel(row: ShippingScheduleRow, rowBy: ShippingTableRowBy): string {
  const variant = row.size ?? row.variantLabel ?? 'Tanpa Varian'
  if (rowBy === 'variant') return variant
  return `${row.product} · ${variant}`
}

export interface PivotCell {
  cepat: number
  reguler: number
  orderNos: string[]
}

export interface PivotRowData {
  label: string
  cells: Record<string, PivotCell>
  total: PivotCell
}

export interface PivotTableData {
  key: string
  title: string
  dateColumns: string[]
  rows: PivotRowData[]
  totalRow: PivotRowData
}

function emptyCell(): PivotCell {
  return { cepat: 0, reguler: 0, orderNos: [] }
}

function addCell(target: PivotCell, source: PivotCell): void {
  target.cepat += source.cepat
  target.reguler += source.reguler
  target.orderNos.push(...source.orderNos)
}

// Numeric-aware label sort (ring sizes as numbers, "US 9.5" style text
// falls back to locale numeric compare) — "Tanpa Ukuran"/"Tanpa Varian"
// rows always sort last regardless of how they compare textually, since
// mixing a numeric label against a text label otherwise isn't transitive.
function compareRowLabels(a: string, b: string): number {
  const aEmpty = a.startsWith('Tanpa ')
  const bEmpty = b.startsWith('Tanpa ')
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
  const na = Number(a)
  const nb = Number(b)
  if (a.trim() !== '' && b.trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b, 'id', { numeric: true })
}

/**
 * Builds one pivot table per pivotTableKeyFor() group: rows = variant/size
 * (numeric-aware sort, e.g. ring sizes), columns = `dateColumns` (supplied
 * by the caller so empty due-dates in the selected range still show up as
 * zero-filled columns, matching a real shipping schedule spreadsheet — not
 * derived from which dates happen to have orders).
 *
 * A row whose dueDate isn't one of `dateColumns` is dropped entirely (not
 * just hidden from the visible columns) — this keeps Total always equal to
 * the sum of the visible cells, rather than silently counting rows the
 * caller's date-range filter was supposed to exclude. Pass
 * NO_DUE_DATE_COLUMN in `dateColumns` to include rows with no due date at
 * all (as a real column, at the end) — omit it to drop them instead.
 * Tables whose grand total is zero across all `dateColumns` are omitted.
 */
export function buildPivotTables(rows: ShippingScheduleRow[], dateColumns: string[], groups: ShippingTableGroup[]): PivotTableData[] {
  const dateColumnSet = new Set(dateColumns)
  const tables = new Map<string, { title: string; rows: Map<string, PivotRowData> }>()

  for (const r of rows) {
    const dateCol = r.dueDate ? r.dueDate.slice(0, 10) : NO_DUE_DATE_COLUMN
    if (!dateColumnSet.has(dateCol)) continue

    const { key, title, rowBy } = pivotTableKeyFor(r, groups)
    if (!tables.has(key)) tables.set(key, { title, rows: new Map() })
    const table = tables.get(key)!

    const label = pivotRowLabel(r, rowBy)
    if (!table.rows.has(label)) table.rows.set(label, { label, cells: {}, total: emptyCell() })
    const row = table.rows.get(label)!

    if (!row.cells[dateCol]) row.cells[dateCol] = emptyCell()
    row.cells[dateCol][r.priority]++
    row.cells[dateCol].orderNos.push(r.orderNo)
    row.total[r.priority]++
    row.total.orderNos.push(r.orderNo)
  }

  // Tables render in the order the user configured them in Settings —
  // General (never configured, no matching keyword) always comes last.
  const groupRank = new Map(groups.map((g, i) => [`table:${g.title}`, i]))

  return [...tables.entries()]
    .map(([key, table]) => {
      const rowsSorted = [...table.rows.values()].sort((a, b) => compareRowLabels(a.label, b.label))
      const totalRow: PivotRowData = { label: 'Total', cells: {}, total: emptyCell() }
      for (const dateCol of dateColumns) {
        totalRow.cells[dateCol] = emptyCell()
        for (const row of rowsSorted) {
          if (row.cells[dateCol]) addCell(totalRow.cells[dateCol], row.cells[dateCol])
        }
      }
      for (const row of rowsSorted) addCell(totalRow.total, row.total)
      return { key, title: table.title, dateColumns, rows: rowsSorted, totalRow }
    })
    .filter((t) => t.totalRow.total.cepat + t.totalRow.total.reguler > 0)
    .sort((a, b) => (groupRank.get(a.key) ?? Infinity) - (groupRank.get(b.key) ?? Infinity))
}

// Hard cap so an accidental huge range (e.g. a full year) can't render
// thousands of date columns — 62 days covers "this month + next month" with
// room to spare; the UI is expected to warn well before this if it lets the
// user pick a range at all.
const MAX_DATE_RANGE_DAYS = 62

/**
 * Inclusive list of "YYYY-MM-DD" dates from `from` to `to`. Parsed and
 * stepped entirely in UTC (not the server/browser's local timezone) so the
 * column list can't drift by a day depending on where this runs — matches
 * how dueDate itself is stored (parseDueDate/parseOrderDate treat a bare
 * "YYYY-MM-DD" as UTC midnight, and isoDate() elsewhere in this codebase
 * does the same). Truncated (not rejected) at MAX_DATE_RANGE_DAYS.
 */
export function dateRangeColumns(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out
  const d = new Date(start)
  while (d <= end && out.length < MAX_DATE_RANGE_DAYS) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}
