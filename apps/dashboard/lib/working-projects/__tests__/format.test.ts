import { describe, it, expect } from 'vitest'
import { buildTitle, buildPostContent, parseDueDate, SIZE_SCALE, parseSize, isGLRing, variantShort, splitProductVariants, parseAmount, appendNoteWithTimestamp, allowedMentionsPayload, notesSegmentForKey } from '../format'

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
  it('true when appliedTags include a ring tag', () => {
    expect(isGLRing(['Green Lantern Ring'])).toBe(true)
  })
  it('true for a cincin tag regardless of forumChannelId (tag-based detection only)', () => {
    expect(isGLRing(['Cincin'])).toBe(true)
  })
  it('false otherwise', () => {
    expect(isGLRing(['Topeng'])).toBe(false)
  })
})

describe('parseAmount', () => {
  it('strips currency formatting to an integer', () => {
    expect(parseAmount('Rp150.000')).toBe(150000)
    expect(parseAmount('150000')).toBe(150000)
  })
  it('returns 0 for empty/invalid input', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
  })
})

describe('appendNoteWithTimestamp', () => {
  it('appends with a bracketed ISO date prefix', () => {
    const result = appendNoteWithTimestamp('existing note', 'new note')
    expect(result.startsWith('existing note\n[')).toBe(true)
    expect(result).toContain('new note')
  })
  it('handles null existing notes', () => {
    expect(appendNoteWithTimestamp(null, 'first note')).toContain('first note')
  })
})

describe('notesSegmentForKey', () => {
  it('returns the whole notes string unchanged for a single-variant project', () => {
    expect(notesSegmentForKey('warna emas | size US 8', 'Cincin A', 1)).toBe('warna emas | size US 8')
  })

  it('matches by key content, not by list position, when segments are NOT in product-variant order', () => {
    // "B" block appears before "A" block — order-independent matching must still
    // resolve each row to its own size, not the positionally-first one.
    const notes = 'B|size US 6|catatan B|A|size US 8|catatan A'
    expect(parseSize(notesSegmentForKey(notes, 'Cincin A', 2)).usSize).toBe('8')
    expect(parseSize(notesSegmentForKey(notes, 'Cincin B', 2)).usSize).toBe('6')
  })

  it('resolves per-variant size when notes use only |, with no " / "-style separator between segments', () => {
    const notes = 'Cincin X|size US 9|catatan X|Cincin Y|size US 11|catatan Y'
    expect(parseSize(notesSegmentForKey(notes, 'Cincin X', 2)).usSize).toBe('9')
    expect(parseSize(notesSegmentForKey(notes, 'Cincin Y', 2)).usSize).toBe('11')
  })

  it('still matches legacy " / "-separated blocks by content, not position', () => {
    const notes = 'A|size US 8|catatan A / B|size US 6|catatan B'
    expect(parseSize(notesSegmentForKey(notes, 'Cincin A', 2)).usSize).toBe('8')
    expect(parseSize(notesSegmentForKey(notes, 'Cincin B', 2)).usSize).toBe('6')
  })
})

describe('allowedMentionsPayload', () => {
  it('never parses everyone/roles, only explicit user ids', () => {
    expect(allowedMentionsPayload(['123', '456'])).toEqual({ parse: [], users: ['123', '456'] })
  })
})
