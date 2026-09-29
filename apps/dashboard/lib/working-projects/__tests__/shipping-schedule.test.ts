import { describe, it, expect } from 'vitest'
import {
  buildShippingScheduleRows,
  detectRowCategory,
  pivotTableKeyFor,
  pivotRowLabel,
  buildPivotTables,
  dateRangeColumns,
  resolveCincinTableTitle,
  findDuplicateCincinKeyword,
  NO_DUE_DATE_COLUMN,
  type ShippingScheduleRow,
} from '../shipping-schedule'
import type { WorkingProject } from '@/lib/hooks/use-working-projects'
import type { CategoryProductIds } from '../category'
import { DEFAULT_CINCIN_TABLE_GROUPS, type CincinTableGroup } from '../service'

const EMPTY_IDS: CategoryProductIds = { cincin: [], topeng: [], clicker: [] }

function wp(overrides: Partial<WorkingProject>): WorkingProject {
  return {
    id: 'wp1', discordThreadId: 't1', source: 'shopee', sourceOrderNo: 'SN1', orderNoLegacy: null,
    customer: 'Budi', contact: null, platform: 'Shopee', product: 'Green Lantern Ring 2026 3D Print',
    variant: 'US 9', status: 'Open', payment: 'Belum', dueDate: '2026-10-01T00:00:00.000Z', dueDateRaw: null,
    invoiceAmount: 100000, checklist: [], appliedTags: ['Cincin'], shipping: 'Anteraja',
    ...overrides,
  }
}

function row(overrides: Partial<ShippingScheduleRow>): ShippingScheduleRow {
  return {
    wpId: 'wp1', orderNo: 'SN1', platform: 'Shopee', customer: 'Budi', product: 'GL Ring 2026',
    category: 'cincin', size: '9', variantLabel: null, dueDate: '2026-10-01T00:00:00.000Z',
    priority: 'reguler', shipping: 'SPX', status: 'Open', itemIndex: 1, itemCount: 1,
    ...overrides,
  }
}

describe('detectRowCategory', () => {
  it('detects cincin/topeng/clicker by name, general otherwise', () => {
    const base = { variantCount: 1, configuredProductIds: EMPTY_IDS, wp: { appliedTags: [], forumChannelId: null, sourceProductId: null } }
    expect(detectRowCategory({ ...base, entry: 'Green Lantern Ring 2026' })).toBe('cincin')
    expect(detectRowCategory({ ...base, entry: 'Topeng Dr Doom' })).toBe('topeng')
    expect(detectRowCategory({ ...base, entry: 'Fidget Clicker' })).toBe('clicker')
    expect(detectRowCategory({ ...base, entry: 'Gantungan Kunci Custom' })).toBe('general')
  })

  it('trusts sourceProductId only for a single-item WP', () => {
    const ids: CategoryProductIds = { cincin: [], topeng: ['999'], clicker: [] }
    expect(detectRowCategory({
      entry: 'Cincin Custom', variantCount: 1, configuredProductIds: ids,
      wp: { appliedTags: [], forumChannelId: null, sourceProductId: '999' },
    })).toBe('topeng')
    expect(detectRowCategory({
      entry: 'Cincin Custom', variantCount: 2, configuredProductIds: ids,
      wp: { appliedTags: [], forumChannelId: null, sourceProductId: '999' },
    })).toBe('cincin')
  })

  it('falls back to isGLRing legacy signals when the regex/ID list find nothing', () => {
    expect(detectRowCategory({
      entry: 'Custom Item With No Category Words', variantCount: 1, configuredProductIds: EMPTY_IDS,
      wp: { appliedTags: ['Cincin'], forumChannelId: null, sourceProductId: null },
    })).toBe('cincin')
  })
})

describe('buildShippingScheduleRows', () => {
  it('includes every WP (not just GL Ring) and detects its category', () => {
    const rows = buildShippingScheduleRows([
      wp({ id: 'wp1', product: 'Green Lantern Ring 2026 3D Print' }),
      wp({ id: 'wp2', product: 'Gantungan Kunci Custom', appliedTags: [], variant: 'Merah' }),
    ], EMPTY_IDS, [])
    expect(rows.map((r) => r.category)).toEqual(['cincin', 'general'])
  })

  it('one row per line item, with 1-based itemIndex/itemCount and per-entry size', () => {
    const rows = buildShippingScheduleRows([
      wp({
        product: 'Green Lantern Ring 2026 3D Print (US 6), Green Lantern Ring 2026 3D Print (US 7), 3D Print Green Lantern Ring Cosplay (US 7)',
        variant: null,
      }),
    ], EMPTY_IDS, [])
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => ({ size: r.size, itemIndex: r.itemIndex, itemCount: r.itemCount }))).toEqual([
      { size: '6', itemIndex: 1, itemCount: 3 },
      { size: '7', itemIndex: 2, itemCount: 3 },
      { size: '7', itemIndex: 3, itemCount: 3 },
    ])
  })

  it('extracts the embedded variant for a multi-item non-size product (e.g. color)', () => {
    const rows = buildShippingScheduleRows([
      wp({ product: 'Crocs Charm Jibbitz (Galaxy Pearl,Kiri), Crocs Charm Jibbitz (Galaxy Pearl,Kanan)', variant: null, appliedTags: [] }),
    ], EMPTY_IDS, [])
    expect(rows.map((r) => r.variantLabel)).toEqual(['Galaxy Pearl,Kiri', 'Galaxy Pearl,Kanan'])
  })

  it('uses the WP-level variant field directly for a single-item order', () => {
    const rows = buildShippingScheduleRows([wp({ product: 'Topeng Dr Doom', variant: 'Merah', appliedTags: [] })], EMPTY_IDS, [])
    expect(rows[0].variantLabel).toBe('Merah')
  })

  it('marks priority "cepat" when the courier matches, "reguler" otherwise', () => {
    expect(buildShippingScheduleRows([wp({ shipping: 'Anteraja' })], EMPTY_IDS, ['anteraja'])[0].priority).toBe('cepat')
    expect(buildShippingScheduleRows([wp({ shipping: 'SPX' })], EMPTY_IDS, ['anteraja'])[0].priority).toBe('reguler')
  })
})

describe('pivotTableKeyFor', () => {
  it('merges every "2026"-named cincin listing into one "GL Ring 2026" table (found 2026-09-29: Shopee listing-name drift, e.g. "...3D Print V.2 New Color", was rendering as separate tables)', () => {
    expect(pivotTableKeyFor(row({ product: 'GL Ring 2026 3D Print' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring 2026', title: 'GL Ring 2026' })
    expect(pivotTableKeyFor(row({ product: 'GL Ring 3D Print v.2 New Color' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring 2026', title: 'GL Ring 2026' })
    expect(pivotTableKeyFor(row({ product: 'GL Ring 3D Print V.2 New Color' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring 2026', title: 'GL Ring 2026' })
  })
  it('merges every cosplay-named cincin listing into one "GL Ring Cosplay" table', () => {
    expect(pivotTableKeyFor(row({ product: '3D Print GL Ring Cosplay' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring Cosplay', title: 'GL Ring Cosplay' })
    expect(pivotTableKeyFor(row({ product: 'GL Ring Cosplay V.2' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring Cosplay', title: 'GL Ring Cosplay' })
  })
  it('folds any GL-branded listing with no "2026" token at all into the flagship GL Ring 2026 table', () => {
    expect(pivotTableKeyFor(row({ product: 'GL Ring 3D Print v.2 New Color' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:GL Ring 2026', title: 'GL Ring 2026' })
  })
  it('keeps a non-GL-branded ring model (different product, different size chart) as its own table', () => {
    expect(pivotTableKeyFor(row({ product: 'Guy Gardner Ring' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'cincin:Guy Gardner Ring', title: 'Guy Gardner Ring' })
  })
  it('gives every other category ONE table regardless of product name', () => {
    expect(pivotTableKeyFor(row({ category: 'topeng', product: 'Topeng A' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'topeng', title: 'Topeng' })
    expect(pivotTableKeyFor(row({ category: 'general', product: 'Anything' }), DEFAULT_CINCIN_TABLE_GROUPS)).toEqual({ key: 'general', title: 'General' })
  })
})

describe('resolveCincinTableTitle', () => {
  const groups: CincinTableGroup[] = [
    { title: 'GL Ring Cosplay', keywords: ['cosplay'] },
    { title: 'GL Ring 2026', keywords: ['gl', 'green lantern'] },
  ]

  it('checks groups in order — Cosplay wins over the broader "gl" group for a Cosplay-named listing', () => {
    expect(resolveCincinTableTitle('3D Print GL Ring Cosplay', groups)).toBe('GL Ring Cosplay')
  })

  it('folds a listing into the first group whose keyword matches, case-insensitively', () => {
    expect(resolveCincinTableTitle('GL Ring 3D Print v.2 New Color', groups)).toBe('GL Ring 2026')
  })

  it('keeps a product matching no group keyword as its own table (raw name)', () => {
    expect(resolveCincinTableTitle('Guy Gardner Ring', groups)).toBe('Guy Gardner Ring')
  })

  it('ignores blank keywords', () => {
    expect(resolveCincinTableTitle('Anything', [{ title: 'X', keywords: ['', '  '] }])).toBe('Anything')
  })
})

describe('findDuplicateCincinKeyword', () => {
  it('returns null when every keyword belongs to a single group', () => {
    expect(findDuplicateCincinKeyword(DEFAULT_CINCIN_TABLE_GROUPS)).toBeNull()
  })

  it('flags a keyword reused across two different groups ("1 produk hanya bisa 1 table")', () => {
    const groups: CincinTableGroup[] = [
      { title: 'GL Ring 2026', keywords: ['gl'] },
      { title: 'GL Ring Cosplay', keywords: ['GL', 'cosplay'] },
    ]
    expect(findDuplicateCincinKeyword(groups)).toBe('GL')
  })

  it('does not flag the same keyword repeated within the SAME group', () => {
    const groups: CincinTableGroup[] = [{ title: 'GL Ring 2026', keywords: ['gl', 'GL'] }]
    expect(findDuplicateCincinKeyword(groups)).toBeNull()
  })
})

describe('pivotRowLabel', () => {
  it('is just the size for cincin', () => {
    expect(pivotRowLabel(row({ category: 'cincin', size: '9' }))).toBe('9')
    expect(pivotRowLabel(row({ category: 'cincin', size: null }))).toBe('Tanpa Ukuran')
  })
  it('is "product · variant" for non-cincin, avoiding collisions across unrelated products sharing a variant tabel', () => {
    expect(pivotRowLabel(row({ category: 'general', product: 'Gantungan A', variantLabel: 'Hitam' }))).toBe('Gantungan A · Hitam')
    expect(pivotRowLabel(row({ category: 'general', product: 'Gantungan B', variantLabel: 'Hitam' }))).toBe('Gantungan B · Hitam')
  })
})

describe('buildPivotTables', () => {
  const cols = ['2026-10-01', '2026-10-02']

  it('builds a table with a numeric-sorted row per size, a Total row, and Total/orderNos on each cell', () => {
    const rows = [
      row({ size: '10', dueDate: '2026-10-02T00:00:00.000Z', orderNo: 'SN2', priority: 'cepat' }),
      row({ size: '9', dueDate: '2026-10-01T00:00:00.000Z', orderNo: 'SN1', priority: 'reguler' }),
    ]
    const [table] = buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)
    expect(table.rows.map((r) => r.label)).toEqual(['9', '10'])
    expect(table.rows[0].cells['2026-10-01']).toEqual({ cepat: 0, reguler: 1, orderNos: ['SN1'] })
    expect(table.rows[1].cells['2026-10-02']).toEqual({ cepat: 1, reguler: 0, orderNos: ['SN2'] })
    expect(table.totalRow.cells['2026-10-01']).toEqual({ cepat: 0, reguler: 1, orderNos: ['SN1'] })
    expect(table.totalRow.total).toEqual({ cepat: 1, reguler: 1, orderNos: ['SN1', 'SN2'] })
  })

  it('drops a row whose due date is outside dateColumns, so Total always matches the visible cells', () => {
    const rows = [row({ size: '9', dueDate: '2026-11-15T00:00:00.000Z' })]
    const tables = buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)
    expect(tables).toEqual([])
  })

  it('includes rows with no due date only when NO_DUE_DATE_COLUMN is explicitly in dateColumns', () => {
    const rows = [row({ size: '9', dueDate: null })]
    expect(buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)).toEqual([])
    const [table] = buildPivotTables(rows, [...cols, NO_DUE_DATE_COLUMN], DEFAULT_CINCIN_TABLE_GROUPS)
    expect(table.rows[0].cells[NO_DUE_DATE_COLUMN].reguler).toBe(1)
  })

  it('puts "Tanpa Ukuran" last even though it does not compare numerically', () => {
    const rows = [
      row({ size: '9' }),
      row({ size: null, orderNo: 'SN2' }),
      row({ size: '7', orderNo: 'SN3' }),
    ]
    const [table] = buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)
    expect(table.rows.map((r) => r.label)).toEqual(['7', '9', 'Tanpa Ukuran'])
  })

  it('omits a table whose grand total is zero across the visible date columns', () => {
    const rows = [row({ dueDate: '2026-11-15T00:00:00.000Z' })] // outside cols -> dropped -> table would be empty
    expect(buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)).toEqual([])
  })

  it('orders tables by category (cincin, topeng, clicker, general), then title within cincin', () => {
    const rows = [
      row({ category: 'general', product: 'X', wpId: 'w1' }),
      row({ category: 'cincin', product: 'GL Ring Cosplay', wpId: 'w2' }),
      row({ category: 'topeng', product: 'Y', wpId: 'w3' }),
      row({ category: 'cincin', product: 'GL Ring 2026', wpId: 'w4' }),
    ]
    const tables = buildPivotTables(rows, cols, DEFAULT_CINCIN_TABLE_GROUPS)
    expect(tables.map((t) => t.title)).toEqual(['GL Ring 2026', 'GL Ring Cosplay', 'Topeng', 'General'])
  })
})

describe('dateRangeColumns', () => {
  it('returns an inclusive list of calendar dates, unaffected by local timezone', () => {
    expect(dateRangeColumns('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
  it('returns a single date when from === to', () => {
    expect(dateRangeColumns('2026-10-01', '2026-10-01')).toEqual(['2026-10-01'])
  })
  it('returns empty for an invalid or inverted range', () => {
    expect(dateRangeColumns('2026-10-03', '2026-10-01')).toEqual([])
    expect(dateRangeColumns('not-a-date', '2026-10-01')).toEqual([])
  })
  it('caps a very long range instead of generating thousands of columns', () => {
    const cols = dateRangeColumns('2026-01-01', '2027-01-01')
    expect(cols.length).toBeLessThanOrEqual(62)
  })
})
