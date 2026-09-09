import { describe, it, expect } from 'vitest'
import { buildTitle, buildPostContent, parseDueDate } from '../format'

describe('buildTitle', () => {
  it('joins customer, product, variant', () => {
    expect(buildTitle({ customer: 'Budi', product: 'Cincin', variant: 'Size 8' }))
      .toBe('Budi - Cincin (Size 8)')
  })
  it('omits variant parens when absent', () => {
    expect(buildTitle({ customer: 'Budi', product: 'Cincin' })).toBe('Budi - Cincin')
  })
})

describe('parseDueDate', () => {
  it('parses ISO-like date strings', () => {
    const r = parseDueDate('2026-09-15')
    expect(r.dueDate?.toISOString().slice(0, 10)).toBe('2026-09-15')
    expect(r.dueDateRaw).toBeNull()
  })
  it('preserves unparseable legacy text verbatim', () => {
    const r = parseDueDate('akhir bulan')
    expect(r.dueDate).toBeNull()
    expect(r.dueDateRaw).toBe('akhir bulan')
  })
  it('treats empty string as no due date at all', () => {
    const r = parseDueDate('')
    expect(r.dueDate).toBeNull()
    expect(r.dueDateRaw).toBeNull()
  })
})

describe('buildPostContent', () => {
  it('prefers sourceOrderNo over orderNoLegacy for display', () => {
    const content = buildPostContent({
      customer: 'Budi', contact: '0812', product: 'Cincin', variant: null,
      platform: 'Shopee', sourceOrderNo: 'SN123', orderNoLegacy: 'legacy-1',
      dueDate: null, dueDateRaw: null, notes: null,
    } as any)
    expect(content).toContain('SN123')
    expect(content).not.toContain('legacy-1')
  })
})
