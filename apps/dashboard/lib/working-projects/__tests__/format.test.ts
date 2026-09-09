import { describe, it, expect } from 'vitest'
import { buildTitle, buildPostContent, parseDueDate, SIZE_SCALE, parseSize, isGLRing, variantShort, splitProductVariants } from '../format'

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

describe('SIZE_SCALE', () => {
  it('maps US ring sizes to scale percentages', () => {
    expect(SIZE_SCALE['8']).toBeTypeOf('number')
    expect(SIZE_SCALE['6']).toBeLessThan(SIZE_SCALE['10'])
  })
})

describe('parseSize', () => {
  it('extracts US size from pipe-delimited notes', () => {
    const r = parseSize('warna emas | size US 8 | catatan lain')
    expect(r.usSize).toBe('8')
    expect(r.scalePct).toBe(SIZE_SCALE['8'])
  })
  it('returns nulls when no size segment present', () => {
    expect(parseSize('warna emas')).toEqual({ usSize: null, scalePct: null })
  })
})

describe('splitProductVariants', () => {
  it('splits comma-joined product string into variants', () => {
    expect(splitProductVariants('Cincin A, Cincin B')).toEqual(['Cincin A', 'Cincin B'])
  })
})

describe('variantShort', () => {
  it('shortens a variant entry for display', () => {
    expect(variantShort('Cincin Green Lantern - Emas')).toBe('Cincin GL - Emas')
  })
})

describe('isGLRing', () => {
  it('true when forumChannelId matches the ring forum', () => {
    expect(isGLRing([], 'FORUM_CINCIN_ID')).toBe(true)
  })
  it('true when appliedTags include a ring tag', () => {
    expect(isGLRing(['Green Lantern Ring'], null)).toBe(true)
  })
  it('false otherwise', () => {
    expect(isGLRing(['Topeng'], 'FORUM_TOPENG_ID')).toBe(false)
  })
})
