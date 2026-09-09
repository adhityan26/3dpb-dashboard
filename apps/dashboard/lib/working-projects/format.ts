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

export function splitProductVariants(product: string): string[] {
  return product.split(',').map(s => s.trim()).filter(Boolean)
}

export function variantShort(entry: string): string {
  return entry.replace(/Green Lantern/gi, 'GL')
}

// Detection is tag-based only: forumChannelId values become real Discord
// snowflakes once Plan B's cutover runs, so a literal string comparison
// against a placeholder like 'FORUM_CINCIN_ID' would silently stop matching.
// The tag regex works regardless of what forumChannelId actually contains.
export function isGLRing(appliedTags: string[]): boolean {
  return appliedTags.some(t => /ring|cincin/i.test(t))
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
