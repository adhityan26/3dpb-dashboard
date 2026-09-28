import { describe, it, expect } from 'vitest'
import { detectProductBucket, buildShippingScheduleRows } from '../shipping-schedule'
import type { WorkingProject } from '@/lib/hooks/use-working-projects'

describe('detectProductBucket', () => {
  it('detects Green Lantern 2026 vs Cosplay by product name', () => {
    expect(detectProductBucket('Green Lantern Ring 2026 3D Print')).toBe('gl2026')
    expect(detectProductBucket('3D Print Green Lantern Ring Cosplay')).toBe('cosplay')
  })
  it('falls back to "lainnya" when neither token is present', () => {
    expect(detectProductBucket('Cincin Custom')).toBe('lainnya')
  })
})

function wp(overrides: Partial<WorkingProject>): WorkingProject {
  return {
    id: 'wp1', discordThreadId: 't1', source: 'shopee', sourceOrderNo: 'SN1', orderNoLegacy: null,
    customer: 'Budi', contact: null, platform: 'Shopee', product: 'Green Lantern Ring 2026 3D Print',
    variant: 'US 9', status: 'Open', payment: 'Belum', dueDate: '2026-10-01T00:00:00.000Z', dueDateRaw: null,
    invoiceAmount: 100000, checklist: [], appliedTags: ['Cincin'], shipping: 'Anteraja',
    ...overrides,
  }
}

describe('buildShippingScheduleRows', () => {
  it('one row per GL Ring order, carrying size, bucket, due date and shipping courier', () => {
    const rows = buildShippingScheduleRows([wp({})], [])
    expect(rows).toEqual([{
      wpId: 'wp1', key: 'GL Ring 2026 3D Print', customer: 'Budi', orderNo: 'SN1', dueDate: '2026-10-01T00:00:00.000Z',
      status: 'Open', usSize: '9', bucket: 'gl2026', shipping: 'Anteraja',
    }])
  })

  it('excludes non-ring products', () => {
    const rows = buildShippingScheduleRows([wp({ product: 'Gantungan Kunci', appliedTags: [] })], [])
    expect(rows).toEqual([])
  })

  it('splits a multi-variant order into one row per variant, each with its own size', () => {
    const rows = buildShippingScheduleRows([
      wp({ product: 'Cincin A, Cincin B', variant: null, notes: 'A|size US 8 / B|size US 6' } as any),
    ], [])
    expect(rows.map(r => ({ key: r.key, usSize: r.usSize }))).toEqual([
      { key: 'Cincin A', usSize: '8' }, { key: 'Cincin B', usSize: '6' },
    ])
  })

  it('carries a null shipping through untouched when the WP has no courier set', () => {
    const rows = buildShippingScheduleRows([wp({ shipping: null })], [])
    expect(rows[0].shipping).toBeNull()
  })
})

describe('buildShippingScheduleRows multi-item order (found 2026-09-28)', () => {
  it('produces one row per line item, each with its own embedded size and its own bucket', () => {
    const wp = {
      id: 'wp9', discordThreadId: 't9', source: 'shopee', sourceOrderNo: 'SN9', orderNoLegacy: null,
      customer: 'Budi', contact: null, platform: 'Shopee',
      product: 'Green Lantern Ring 2026 3D Print (US 6), Green Lantern Ring 2026 3D Print (US 7), 3D Print Green Lantern Ring Cosplay (US 7)',
      variant: null, status: 'Open', payment: 'Belum', dueDate: '2026-10-01T00:00:00.000Z', dueDateRaw: null,
      invoiceAmount: 100000, checklist: [], appliedTags: ['Cincin'], shipping: null,
    } as any
    const rows = buildShippingScheduleRows([wp], [])
    expect(rows.map(r => ({ usSize: r.usSize, bucket: r.bucket }))).toEqual([
      { usSize: '6', bucket: 'gl2026' },
      { usSize: '7', bucket: 'gl2026' },
      { usSize: '7', bucket: 'cosplay' },
    ])
  })
})
