export function buildTitle(wp: { customer: string; product: string; variant?: string | null }): string {
  const base = `${wp.customer} - ${wp.product}`
  return wp.variant ? `${base} (${wp.variant})` : base
}

export function parseDueDate(raw: string): { dueDate: Date | null; dueDateRaw: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { dueDate: null, dueDateRaw: null }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return { dueDate: parsed, dueDateRaw: null }
  }
  return { dueDate: null, dueDateRaw: trimmed }
}

export function buildPostContent(wp: {
  customer: string
  contact?: string | null
  product: string
  variant?: string | null
  platform?: string | null
  sourceOrderNo?: string | null
  orderNoLegacy?: string | null
  dueDate?: Date | null
  dueDateRaw?: string | null
  notes?: string | null
}): string {
  const lines = [
    `**Customer:** ${wp.customer}${wp.contact ? ` (${wp.contact})` : ''}`,
    `**Produk:** ${wp.product}${wp.variant ? ` — ${wp.variant}` : ''}`,
  ]
  if (wp.platform) lines.push(`**Platform:** ${wp.platform}`)
  const orderNo = wp.sourceOrderNo ?? wp.orderNoLegacy
  if (orderNo) lines.push(`**No. Order:** ${orderNo}`)
  const due = wp.dueDate ? wp.dueDate.toISOString().slice(0, 10) : wp.dueDateRaw
  if (due) lines.push(`**Due Date:** ${due}`)
  if (wp.notes) lines.push(`**Catatan:** ${wp.notes}`)
  return lines.join('\n')
}

export const SIZE_SCALE: Record<string, number> = {
  '5': 88, '6': 91, '7': 94, '8': 97, '9': 100, '10': 103, '11': 106, '12': 109,
}

export function parseSize(notes: string): { usSize: string | null; scalePct: number | null } {
  const segments = notes.split('|').map(s => s.trim())
  for (const seg of segments) {
    const m = seg.match(/size\s*(?:us)?\s*(\d{1,2})/i)
    if (m) {
      const usSize = m[1]
      return { usSize, scalePct: SIZE_SCALE[usSize] ?? null }
    }
  }
  return { usSize: null, scalePct: null }
}

// Notes for a multi-variant project encode a size/notes block per variant.
// Two storage shapes are in use:
//   (a) legacy: variant blocks separated by ' / ', each block itself
//       '|'-delimited, e.g. "A|size US 8|catatan A / B|size US 6|catatan B"
//   (b) flat: no ' / ' separator at all, just one '|'-delimited sequence,
//       e.g. "B|size US 6|catatan B|A|size US 8|catatan A" (segments may
//       appear in ANY order relative to the product-variant list).
// Matching is always CONTENT-based (never by list position/index) — a field
// "identifies" a variant's `key` when it case-insensitively equals, is
// contained by, or contains the key (handles both a full key like
// "Cincin A" appearing verbatim, and a short field like "A" that is the
// trailing/short form of that key).
function fieldIdentifiesKey(field: string, lowerKey: string): boolean {
  const f = field.trim().toLowerCase()
  if (!f) return false
  return f === lowerKey || lowerKey.includes(f) || f.includes(lowerKey)
}

export function notesSegmentForKey(notes: string, key: string, variantCount: number): string {
  if (variantCount <= 1) return notes
  const lowerKey = key.trim().toLowerCase()

  // Shape (a): ' / '-separated variant blocks.
  if (notes.includes(' / ')) {
    const blocks = notes.split(' / ').map(b => b.trim())
    const match = blocks.find(b => b.split('|').some(f => fieldIdentifiesKey(f, lowerKey)))
    if (match) return match
  }

  // Shape (b): flat '|'-delimited sequence, segments in any order. Find the
  // field identifying this variant, then take the contiguous run of fields
  // from there through the next field carrying a `size` token (inclusive) —
  // that's the data segment this variant's identifier field introduces.
  const fields = notes.split('|').map(f => f.trim())
  const matchIdx = fields.findIndex(f => fieldIdentifiesKey(f, lowerKey))
  if (matchIdx !== -1) {
    let end = matchIdx
    for (let i = matchIdx + 1; i < fields.length; i++) {
      end = i
      if (/size/i.test(fields[i])) break
    }
    return fields.slice(matchIdx, end + 1).join('|')
  }

  return notes
}

export function splitProductVariants(product: string): string[] {
  return product.split(',').map(s => s.trim()).filter(Boolean)
}

export function variantShort(entry: string): string {
  return entry.replace(/Green Lantern/gi, 'GL')
}

// Detection is tag-OR-channel based. `appliedTags` is only ever populated by
// the Discord threadUpdate echo route, so a project created straight from an
// order (createWorkingProject / create-from-order.ts) into the Cincin forum
// channel never gets a tag until a human manually applies one on Discord —
// it must still show up on the GL Ring tab via its forumChannelId. The tag
// regex is kept as the primary signal (works regardless of what
// forumChannelId actually contains) with the channel-id comparison as a
// fallback against the SAME Cincin forum channel id create-from-order.ts
// resolves (NEXT_PUBLIC_FORUM_CINCIN_ID, passed in by the caller since this
// function itself is used both server- and client-side).
export function isGLRing(appliedTags: string[], forumChannelId?: string | null): boolean {
  if (appliedTags.some(t => /ring|cincin/i.test(t))) return true
  if (forumChannelId) {
    const cincinId = process.env.NEXT_PUBLIC_FORUM_CINCIN_ID ?? "FORUM_CINCIN_ID"
    if (forumChannelId === cincinId) return true
  }
  return false
}

export function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

export function appendNoteWithTimestamp(existing: string | null, note: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const line = `[${stamp}] ${note}`
  return existing ? `${existing}\n${line}` : line
}

export function allowedMentionsPayload(mentions: string[]): { parse: []; users: string[] } {
  return { parse: [], users: mentions }
}
