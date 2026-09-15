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

// orderDate has no "raw" fallback column (unlike dueDate) — it's always
// edited via a plain <input type="date">, so a bare ISO date parse is
// enough. An empty/unparseable value clears the field.
export function parseOrderDate(raw: string): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatRp(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`
}

type ChecklistItemLike = { text: string; done: boolean; deleted?: boolean }

function renderChecklist(checklist: ChecklistItemLike[]): string {
  const active = (checklist ?? []).filter(i => !i.deleted)
  if (!active.length) return ''
  return active.map(i => `${i.done ? '✅' : '⬜'} ${i.text}`).join('\n')
}

// Ported verbatim (format + emoji + section order) from the original
// ai-assistant order-baru.js buildPostContent — this is the Discord starter
// post body, and every field it renders must be resynced (via setStatus/
// markDone/updateWorkingProject/runChecklistOp) on every mutation, or the
// visible thread message silently drifts from the actual persisted state.
export function buildPostContent(wp: {
  customer: string
  contact?: string | null
  product: string
  variant?: string | null
  platform?: string | null
  sourceOrderNo?: string | null
  orderNoLegacy?: string | null
  orderDate?: Date | null
  dueDate?: Date | null
  dueDateRaw?: string | null
  status?: string | null
  payment?: string | null
  invoiceAmount?: number | null
  paidAmount?: number | null
  shipping?: string | null
  trackingNo?: string | null
  mentions?: string[] | null
  notes?: string | null
  checklist?: ChecklistItemLike[] | null
}): string {
  const orderNo = wp.sourceOrderNo ?? wp.orderNoLegacy
  const due = wp.dueDate ? wp.dueDate.toISOString().slice(0, 10) : wp.dueDateRaw
  const orderDateDisplay = wp.orderDate ? wp.orderDate.toISOString().slice(0, 10) : null
  const invoiceAmount = wp.invoiceAmount ?? 0
  const paidAmount = wp.paidAmount ?? 0
  const mentionStr = (wp.mentions ?? []).map(id => `<@${id}>`).join(' ')

  const lines = [
    `📋 **Detail Order**`,
    `👤 Customer   : ${wp.customer || '-'}`,
  ]
  if (orderDateDisplay) lines.push(`📆 Tgl Order  : ${orderDateDisplay}`)
  lines.push(
    `📱 Contact    : ${wp.contact || '-'}`,
    `🛒 Platform   : ${wp.platform || '-'}`,
    `🔢 No. Order  : ${orderNo || '-'}`,
    `📦 Produk     : ${wp.product || '-'}`,
  )
  if (wp.variant) lines.push(`🎨 Variant    : ${wp.variant}`)
  if (wp.shipping) lines.push(`🚚 Pengiriman : ${wp.shipping}`)
  if (wp.trackingNo) lines.push(`📮 Resi       : ${wp.trackingNo}`)
  lines.push(
    `📅 Due Date   : ${due || '-'}`,
    ``,
    `🔄 Status     : ${wp.status || 'Open'}`,
    `💳 Payment    : ${wp.payment || 'Belum'}`,
  )
  if (invoiceAmount > 0) {
    lines.push(`💰 Invoice    : ${formatRp(invoiceAmount)}`)
    lines.push(`   Dibayar   : ${formatRp(paidAmount)}`)
  }
  lines.push(``, mentionStr)
  if (wp.notes) lines.push(``, `──────────────────────────`, ``, wp.notes)
  const checklistSection = renderChecklist(wp.checklist ?? [])
  if (checklistSection) lines.push(``, `──────────────────────────`, ``, checklistSection)
  return lines.join('\n')
}

// Real order notes encode size in several ways found in production data:
//   "size US 8" / "size US 9.5"      — original expected shape
//   "US 9.5" (no "size"/"ukuran")    — bare segment, e.g. from a
//                                       multi-segment note like
//                                       "... ukuran 7.5 | US 9.5 | scale 83%"
//   "Ukuran: US 13"                  — Indonesian label, with colon
//   "Ukuran 7.5" (no "US" at all)    — Indonesian label, no US token
// "US <n>" is preferred over a bare "ukuran <n>" when both appear.
//
// NOTE: this only extracts the US size string — it does NOT compute a print
// scale percentage. An earlier version of this function fabricated one from
// a made-up lookup table (`SIZE_SCALE`, +3%-per-size); that table didn't
// match the real formula the Ring Resizer feature actually uses
// (lib/ring-resizer/sizing.ts's computeScale, keyed off a per-model
// baseBoreMm) and was actively wrong (e.g. claimed US 9 = 100% when the real
// figure, using the "Green Lantern 2026" model's baseBoreMm, is 81%). Scale
// display now goes through computeScale() with a real baseBoreMm instead —
// see WorkingProjectGLRingTab.tsx.
export function parseSize(notes: string): { usSize: string | null } {
  const segments = notes.split('|').map(s => s.trim())
  for (const seg of segments) {
    const m = seg.match(/(?:size|ukuran)?\s*:?\s*\bus\s*(\d{1,2}(?:\.\d)?)/i)
    if (m) return { usSize: m[1] }
  }
  for (const seg of segments) {
    const m = seg.match(/(?:size|ukuran)\s*:?\s*(\d{1,2}(?:\.\d)?)/i)
    if (m) return { usSize: m[1] }
  }
  return { usSize: null }
}

// The `variant` field on a GL Ring row is sometimes JUST the bare number
// (e.g. "11", "8.5") with no "US"/"size"/"ukuran" token at all — a shape
// parseSize() deliberately doesn't accept for free-text notes (a bare
// number there is too ambiguous), but is unambiguous here since the whole
// field IS the variant/size value, nothing else. Try parseSize() first (it
// still handles "US 11" etc. in this field), then fall back to a bare
// number occupying the entire trimmed string.
export function parseSizeFromVariantField(variant: string): { usSize: string | null } {
  const viaParseSize = parseSize(variant)
  if (viaParseSize.usSize) return viaParseSize
  const bare = variant.trim().match(/^(\d{1,2}(?:\.\d)?)$/)
  if (bare) return { usSize: bare[1] }
  return { usSize: null }
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
// A field may also be a labelled value like "GL Ring Cosplay: US 7 scale 74%"
// (real production shape) — the label before the ':' is what identifies the
// variant, so it is tested on its own as well as the full field.
function fieldIdentifiesKey(field: string, lowerKey: string): boolean {
  const f = field.trim().toLowerCase()
  if (!f) return false
  if (f === lowerKey || lowerKey.includes(f) || f.includes(lowerKey)) return true
  const colon = f.indexOf(':')
  if (colon > 0) {
    const label = f.slice(0, colon).trim()
    return !!label && (label === lowerKey || lowerKey.includes(label) || label.includes(lowerKey))
  }
  return false
}

// Any of the size encodings parseSize understands ("size ...", "ukuran ...",
// bare "US 9.5") terminates a variant's data segment.
const SIZE_TOKEN = /size|ukuran|\bus\s*\d/i

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
  // from there through the next field carrying a size token (inclusive) —
  // that's the data segment this variant's identifier field introduces. If
  // the identifying field itself carries the size ("Label: US 7 ..."), the
  // segment is just that field — never bleed into the next variant's.
  const fields = notes.split('|').map(f => f.trim())
  const matchIdx = fields.findIndex(f => fieldIdentifiesKey(f, lowerKey))
  if (matchIdx !== -1) {
    let end = matchIdx
    if (!SIZE_TOKEN.test(fields[matchIdx])) {
      for (let i = matchIdx + 1; i < fields.length; i++) {
        end = i
        if (SIZE_TOKEN.test(fields[i])) break
      }
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

// Detection signals, checked in order of reliability:
//   1. sourceProductId membership in a curated, admin-configured list
//      (Settings > Lainnya > "Produk Green Lantern Ring") — this is the
//      precise, intentional signal, but only populated for rows created
//      through a path that captures the marketplace item id (currently:
//      the dashboard's own "Buat Working Project" row action for Shopee
//      orders; ai-assistant's /order-dari-shopee does not capture it yet).
//   2. product name containing "ring"/"cincin" — the fallback that keeps
//      the GL Ring tab working for the ~100+ already-migrated rows and any
//      row created through a path that doesn't capture sourceProductId.
//      Matches the legacy ai-assistant behavior, which also keyed off the
//      product name.
//   3. appliedTags / forumChannelId — legacy signals from before product-id
//      matching existed, kept for rows with a generic/empty product field.
export function isGLRing(
  appliedTags: string[],
  forumChannelId?: string | null,
  product?: string | null,
  sourceProductId?: string | null,
  configuredProductIds?: string[],
): boolean {
  if (sourceProductId && configuredProductIds?.includes(sourceProductId)) return true
  if (product && /ring|cincin/i.test(product)) return true
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
