import { describe, it, expect } from 'vitest'
import { sizeCountsFor, groupByDay } from '../WorkingProjectShippingScheduleTab'
import type { ShippingScheduleRow } from '@/lib/working-projects/shipping-schedule'

function row(overrides: Partial<ShippingScheduleRow>): ShippingScheduleRow {
  return {
    wpId: 'wp1', key: 'GL Ring', customer: 'Budi', orderNo: 'SN1', dueDate: '2026-10-01T00:00:00.000Z',
    status: 'Open', usSize: '9', bucket: 'gl2026', shipping: 'Anteraja',
    ...overrides,
  }
}

describe('sizeCountsFor', () => {
  it('counts rows per size, numerically sorted, with order numbers attached', () => {
    const counts = sizeCountsFor([
      row({ usSize: '10', orderNo: 'SN2' }),
      row({ usSize: '9', orderNo: 'SN1' }),
      row({ usSize: '9', orderNo: 'SN3' }),
    ])
    expect(counts).toEqual([
      { size: '9', count: 2, orderNos: ['SN1', 'SN3'] },
      { size: '10', count: 1, orderNos: ['SN2'] },
    ])
  })

  it('buckets rows with no size under "Tanpa Ukuran"', () => {
    const counts = sizeCountsFor([row({ usSize: null })])
    expect(counts).toEqual([{ size: 'Tanpa Ukuran', count: 1, orderNos: ['SN1'] }])
  })
})

describe('groupByDay', () => {
  it('splits into cepat/reguler by courier, then by product bucket, per due date', () => {
    const rows = [
      row({ dueDate: '2026-10-01T00:00:00.000Z', shipping: 'Anteraja', bucket: 'gl2026', usSize: '9' }),
      row({ dueDate: '2026-10-01T00:00:00.000Z', shipping: 'SPX', bucket: 'cosplay', usSize: '7', orderNo: 'SN2' }),
    ]
    const groups = groupByDay(rows, ['anteraja', 'paxel', 'grab', 'gojek'])
    expect(groups).toHaveLength(1)
    expect(groups[0].byPriority.cepat.gl2026).toEqual([{ size: '9', count: 1, orderNos: ['SN1'] }])
    expect(groups[0].byPriority.reguler.cosplay).toEqual([{ size: '7', count: 1, orderNos: ['SN2'] }])
    expect(groups[0].byPriority.cepat.cosplay).toBeUndefined()
  })

  it('sorts due dates ascending and puts rows with no due date last', () => {
    const groups = groupByDay([
      row({ dueDate: null, orderNo: 'SN-none' }),
      row({ dueDate: '2026-10-05T00:00:00.000Z', orderNo: 'SN-later' }),
      row({ dueDate: '2026-10-01T00:00:00.000Z', orderNo: 'SN-earlier' }),
    ], [])
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-10-01', '2026-10-05', 'no-due-date'])
    expect(groups[2].dateLabel).toBe('Tanpa Due Date')
  })

  it('treats an unconfigured courier as reguler (no fast couriers configured)', () => {
    const groups = groupByDay([row({ shipping: 'Anteraja' })], [])
    expect(groups[0].byPriority.reguler.gl2026).toBeDefined()
    expect(groups[0].byPriority.cepat.gl2026).toBeUndefined()
  })
})
