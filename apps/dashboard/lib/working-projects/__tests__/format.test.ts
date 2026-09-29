import { describe, it, expect } from 'vitest'
import { buildTitle, buildPostContent, parseDueDate, parseOrderDate, parseSize, parseSizeFromVariantField, isGLRing, variantShort, splitProductVariants, parseAmount, appendNoteWithTimestamp, allowedMentionsPayload, notesSegmentForKey, buildMultiItemProduct, resolveVariantEntrySize } from '../format'

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

describe('parseOrderDate', () => {
  it('parses an ISO date string', () => {
    expect(parseOrderDate('2026-09-01')?.toISOString().slice(0, 10)).toBe('2026-09-01')
  })
  it('returns null for an empty string', () => {
    expect(parseOrderDate('')).toBeNull()
  })
  it('returns null for unparseable text (no raw fallback for order date)', () => {
    expect(parseOrderDate('akhir bulan')).toBeNull()
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

describe('parseSize', () => {
  it('extracts US size from pipe-delimited notes', () => {
    const r = parseSize('warna emas | size US 8 | catatan lain')
    expect(r.usSize).toBe('8')
  })
  it('returns nulls when no size segment present', () => {
    expect(parseSize('warna emas')).toEqual({ usSize: null })
  })

  // Real production notes (found 2026-09-16 after a batch of orders showed
  // "-" for every row on the GL Ring tab) use several shapes besides
  // "size US <n>" — the strict "size" keyword requirement missed all of them.
  it('extracts a bare "US <n>" segment with no "size"/"ukuran" label', () => {
    const r = parseSize('yang sesuai gambar ya kak GL 2026 ukuran 7.5 | US 9.5 | scale 83%')
    expect(r.usSize).toBe('9.5')
  })
  it('extracts size from an Indonesian "Ukuran: US <n>" label', () => {
    expect(parseSize('Ukuran: US 13').usSize).toBe('13')
  })
  it('extracts size from an Indonesian "Ukuran <n>" label with no US token', () => {
    expect(parseSize('Ukuran 9').usSize).toBe('9')
  })
  it('extracts a half size verbatim, with no scale computation (that lives in the GL Ring tab via the real Ring Resizer formula)', () => {
    expect(parseSize('size US 9.5')).toEqual({ usSize: '9.5' })
  })
  it('resolves size 13', () => {
    expect(parseSize('size US 13').usSize).toBe('13')
  })
})

describe('parseSize latest mention', () => {
  it('takes the last size when several are mentioned', () => {
    expect(parseSize('awalnya US 5, ganti US 9').usSize).toBe('9')
    expect(parseSize('size US 5 | catatan | ganti size US 9.5').usSize).toBe('9.5')
  })
})

describe('parseSizeFromVariantField', () => {
  // Real production shape: the `variant` field on a bulk-created GL Ring row
  // is sometimes just the bare number, no "US"/"size" token at all — found
  // 2026-09-16 after the notes-based fallback still left 53 rows blank.
  it('accepts a bare whole number occupying the entire field', () => {
    expect(parseSizeFromVariantField('11').usSize).toBe('11')
  })
  it('accepts a bare half size occupying the entire field', () => {
    expect(parseSizeFromVariantField('8.5').usSize).toBe('8.5')
  })
  it('still prefers a "US n" match when present, over treating it as a bare number', () => {
    expect(parseSizeFromVariantField('US 9').usSize).toBe('9')
  })
  it('does not treat a number embedded in other text as a bare size (too ambiguous outside this field)', () => {
    expect(parseSizeFromVariantField('Warna Emas 11').usSize).toBeNull()
  })
  it('returns null for an empty field', () => {
    expect(parseSizeFromVariantField('').usSize).toBeNull()
  })
})

describe('splitProductVariants', () => {
  it('splits comma-joined product string into variants', () => {
    expect(splitProductVariants('Cincin A, Cincin B')).toEqual(['Cincin A', 'Cincin B'])
  })

  it('does not split on a comma that is inside parentheses (found 2026-09-29: real Crocs Charm entries embed "Kiri,Kanan"-style commas)', () => {
    expect(splitProductVariants(
      '3D Print Crocs Charm Jibbitz Swoosh Side Logo (SATUAN) (Galaxy Pearl,Kiri), 3D Print Crocs Charm Jibbitz Swoosh Side Logo (SATUAN) (Galaxy Pearl,Kanan)',
    )).toEqual([
      '3D Print Crocs Charm Jibbitz Swoosh Side Logo (SATUAN) (Galaxy Pearl,Kiri)',
      '3D Print Crocs Charm Jibbitz Swoosh Side Logo (SATUAN) (Galaxy Pearl,Kanan)',
    ])
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
  it('true for a cincin tag regardless of forumChannelId', () => {
    expect(isGLRing(['Cincin'])).toBe(true)
  })
  it('false otherwise', () => {
    expect(isGLRing(['Topeng'])).toBe(false)
  })
  it('does not treat "Earrings" as a ring by product name (substring false positive found 2026-09-27)', () => {
    expect(isGLRing([], null, '3D Print Agnes Tachyon Earrings - Umamusume')).toBe(false)
  })
  it('true when appliedTags is empty but forumChannelId matches the Cincin forum channel env fallback', () => {
    const cincinId = process.env.NEXT_PUBLIC_FORUM_CINCIN_ID ?? 'FORUM_CINCIN_ID'
    expect(isGLRing([], cincinId)).toBe(true)
  })
  it('false when appliedTags is empty and forumChannelId does not match', () => {
    expect(isGLRing([], 'some-other-channel-id')).toBe(false)
  })
  it('true when the product name itself mentions ring/cincin, even with no tags or matching forum — the common real-world case for Shopee/Tokopedia-created orders in the general forum', () => {
    expect(isGLRing([], null, 'Green Lantern Ring 2026 3D Print')).toBe(true)
    expect(isGLRing([], 'some-other-channel-id', '3D Print Green Lantern Ring Cosplay')).toBe(true)
  })
  it('false when product name does not mention ring/cincin and no other signal matches', () => {
    expect(isGLRing([], null, 'Custom Clicker Flat RGB 3D Print')).toBe(false)
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

  // Real production shape: "<label>: US <n> scale <p>%" fields where the label
  // is a short form of the variant key. Previously the full field never
  // matched the key, so the whole notes string fell through and BOTH variants
  // got the first field's size.
  it('matches a "Label: US n ..." field by its label prefix and keeps each variant on its own size', () => {
    const notes = 'GL Ring Cosplay: US 7 scale 74% | GL Ring 2026: US 9 scale 100%'
    expect(parseSize(notesSegmentForKey(notes, '3D Print GL Ring Cosplay', 2)).usSize).toBe('7')
    expect(parseSize(notesSegmentForKey(notes, 'GL Ring 2026 3D Print', 2)).usSize).toBe('9')
  })

  it('terminates a variant segment at an "ukuran"/bare "US" field, not only at a literal "size" field', () => {
    const notes = 'Cincin X|ukuran 9|catatan X|Cincin Y|US 11|catatan Y'
    expect(parseSize(notesSegmentForKey(notes, 'Cincin X', 2)).usSize).toBe('9')
    expect(parseSize(notesSegmentForKey(notes, 'Cincin Y', 2)).usSize).toBe('11')
  })
})

describe('allowedMentionsPayload', () => {
  it('never parses everyone/roles, only explicit user ids', () => {
    expect(allowedMentionsPayload(['123', '456'])).toEqual({ parse: [], users: ['123', '456'] })
  })
})

describe('buildMultiItemProduct', () => {
  it('returns the bare name for a single item (no size suffix, byte-identical to legacy behavior)', () => {
    expect(buildMultiItemProduct([{ name: 'Green Lantern Ring 2026 3D Print', variant: 'US 9' }]))
      .toBe('Green Lantern Ring 2026 3D Print')
  })

  it('embeds each item\'s variant so two identically-named items stay distinguishable', () => {
    expect(buildMultiItemProduct([
      { name: 'Green Lantern Ring 2026 3D Print', variant: 'US 6' },
      { name: 'Green Lantern Ring 2026 3D Print', variant: 'US 7' },
      { name: '3D Print Green Lantern Ring Cosplay', variant: 'US 7' },
    ])).toBe(
      'Green Lantern Ring 2026 3D Print (US 6), Green Lantern Ring 2026 3D Print (US 7), 3D Print Green Lantern Ring Cosplay (US 7)',
    )
  })

  it('omits the parens for a multi-item entry with no variant', () => {
    expect(buildMultiItemProduct([{ name: 'A' }, { name: 'B', variant: 'US 7' }])).toBe('A, B (US 7)')
  })

  it('returns empty string for zero items', () => {
    expect(buildMultiItemProduct([])).toBe('')
  })
})

describe('resolveVariantEntrySize', () => {
  it('reads the size embedded in a multi-item entry when notes/variant field have nothing', () => {
    const r = resolveVariantEntrySize({
      entry: 'Green Lantern Ring 2026 3D Print (US 6)', key: 'GL Ring 2026 3D Print (US 6)',
      notes: null, variant: null, variantCount: 3,
    })
    expect(r.usSize).toBe('6')
  })

  it('still lets notes override an entry-embedded size', () => {
    const r = resolveVariantEntrySize({
      entry: 'Green Lantern Ring 2026 3D Print (US 6)', key: 'GL Ring 2026 3D Print (US 6)',
      notes: 'GL Ring 2026 3D Print (US 6): ganti ke US 8', variant: null, variantCount: 3,
    })
    expect(r.usSize).toBe('8')
  })

  it('does not use entry-embedded size for a legacy single-item row (no parens in a bare product name)', () => {
    const r = resolveVariantEntrySize({
      entry: 'Green Lantern Ring 2026 3D Print', key: 'GL Ring 2026 3D Print',
      notes: null, variant: 'US 9', variantCount: 1,
    })
    expect(r.usSize).toBe('9')
  })

  it('reads a bare-number embedded variant with no "US"/"size" token (found 2026-09-29 on real order 260909K0PTQ4P8: Shopee model_name was plain "11.5")', () => {
    const r = resolveVariantEntrySize({
      entry: 'Green Lantern Ring 2026 3D Print V.2 New Color (11.5)', key: 'GL Ring 2026 3D Print V.2 New Color (11.5)',
      notes: null, variant: null, variantCount: 2,
    })
    expect(r.usSize).toBe('11.5')
  })
})
