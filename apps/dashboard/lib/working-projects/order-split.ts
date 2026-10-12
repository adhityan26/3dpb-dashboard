// Pure planner for splitting one ACTIVE legacy combined working project (one WP for a whole
// marketplace order) into one WP per order unit. It never guesses: whenever the WP's notes or
// checklist cannot be mapped onto units without ambiguity, the plan is rejected with a named
// reason so the order can be handled manually. No server/db imports - safe for any bundle.
import { splitProductVariants, notesSegmentForKey, variantShort } from './format'
import { expandOrderUnits, type OrderLine, type OrderUnit } from './order-units'

export interface SplitWp {
  id: string
  product: string
  variant: string | null
  notes: string | null
  status: string
  checklist: { text: string; done: boolean; deleted?: boolean }[]
  sourceItemKey: string | null
  orderId: string | null
  discordThreadId: string | null
  forumChannelId: string | null
}
export interface SplitAssignment {
  unit: OrderUnit
  reuse: boolean
  product: string
  variant: string | null
  notes: string | null
  checklist: SplitWp['checklist'] // items to keep on this WP (prefix stripped)
}
// `detail` carries human-readable evidence for the dry-run report (e.g. the residual notes text).
export type SplitPlan = { ok: true; assignments: SplitAssignment[] } | { ok: false; reason: string; detail?: string }

export const SPLITTABLE_STATUSES: readonly string[] = ['Open', 'Proses', 'Siap Kirim', 'Waiting Customer']

export function pickLegacyWp<T extends { id: string; discordThreadId: string | null }>(wps: T[]): { ok: true; wp: T } | { ok: false; reason: 'duplicate-legacy' | 'empty' } {
  if (wps.length === 0) return { ok: false, reason: 'empty' }
  if (wps.length > 1) return { ok: false, reason: 'duplicate-legacy' }
  return { ok: true, wp: wps[0] }
}

const fail = (reason: string, detail?: string): SplitPlan => ({ ok: false, reason, detail })
const norm = (s: string) => s.trim().toLowerCase()
const SEP = ' — ' // " — " as written by the GL Ring tab: "<variantShort(entry)> — <step>"
const TIMESTAMP_LINE = /^\s*\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}[^\]]*\].*$/gm
const SIZE_VALUE = /\bus\s*(\d{1,2}(?:\.\d)?)|(?:size|ukuran)\s*:?\s*(\d{1,2}(?:\.\d)?)/gi

function distinctSizes(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.matchAll(SIZE_VALUE)) out.add(Number(m[1] ?? m[2]))
  return out
}
// Notes fields as the segment matcher sees them: ' / ' blocks and '|' fields, trimmed.
function tokens(text: string): string[] {
  return text.split(/\s\/\s|\|/).map(t => t.trim()).filter(Boolean)
}

export function planOrderSplit(wp: SplitWp, lines: OrderLine[], forumForUnit: (u: OrderUnit) => string): SplitPlan {
  if (!SPLITTABLE_STATUSES.includes(wp.status)) return fail('not-active')
  if (wp.sourceItemKey) return fail('already-split')
  if (!wp.discordThreadId) return fail('no-thread')
  // Conservative: a WP not linked to a MarketplaceOrder, or an order with no lines, cannot be verified.
  if (!wp.orderId || lines.length === 0) return fail('no-order')
  const units = expandOrderUnits(lines)
  if (units.length <= 1) return fail('single-unit')
  if (new Set(units.map(forumForUnit)).size > 1) return fail('cross-category')

  const entries = splitProductVariants(wp.product)
  if (entries.length !== lines.length) return fail('entry-count')
  const single = lines.length === 1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    // Single-line orders keep the variant in its own field, so the entry is just the name.
    const expected = single || !l.variantName ? l.productName : `${l.productName} (${l.variantName})`
    if (norm(entries[i]) !== norm(expected)) return fail('entry-mismatch')
  }

  // Which order line each unit belongs to (same iteration as expandOrderUnits).
  const lineOfUnit: number[] = []
  lines.forEach((l, i) => { for (let n = 0; n < Math.max(0, Math.floor(l.qty)); n++) lineOfUnit.push(i) })
  const firstUnitOfLine = new Set<number>()
  const isFirstOfLine = lineOfUnit.map((li) => { const first = !firstUnitOfLine.has(li); firstUnitOfLine.add(li); return first })

  // ---- checklist ----
  const perUnitChecklist: SplitWp['checklist'][] = units.map(() => [])
  const shorts = entries.map(e => norm(variantShort(e)))
  for (const item of wp.checklist ?? []) {
    if (item.deleted) continue
    const at = item.text.indexOf(SEP)
    if (at < 0) {
      // A done item with no owner cannot be attributed to a unit; an undone one is harmless to copy.
      if (item.done) return fail('checklist-unmappable', item.text)
      units.forEach((_, u) => perUnitChecklist[u].push({ ...item }))
      continue
    }
    const prefix = norm(item.text.slice(0, at))
    const owners = shorts.flatMap((s, i) => (s === prefix ? [i] : []))
    // Unknown prefix or ambiguous (two entries with the same short name) -> never guess.
    if (owners.length !== 1) return fail('checklist-unmappable', item.text)
    const stripped = item.text.slice(at + SEP.length).trim()
    units.forEach((_, u) => {
      if (lineOfUnit[u] !== owners[0]) return
      // Sibling units of the same line get the step but not the progress.
      perUnitChecklist[u].push({ ...item, text: stripped, done: isFirstOfLine[u] ? item.done : false })
    })
  }

  // ---- notes ----
  const notes = wp.notes && wp.notes.trim() ? wp.notes : null
  const perLineNotes: (string | null)[] = lines.map(() => notes)
  if (notes && lines.length > 1) {
    const segs: string[] = []
    for (let i = 0; i < lines.length; i++) {
      let seg = notesSegmentForKey(notes, entries[i], lines.length)
      if (seg === notes) seg = notesSegmentForKey(notes, variantShort(entries[i]), lines.length)
      // seg === notes means no segment matched (notesSegmentForKey falls back to everything).
      if (seg === notes) return fail('notes-unmappable')
      segs.push(seg)
    }
    if (new Set(segs).size !== segs.length) return fail('notes-unmappable')
    // Anything left once the matched segments are removed has no owner. Appended "[timestamp] ..."
    // lines live inside the last segment's text, so they are detected separately.
    const stamped = notes.match(TIMESTAMP_LINE)
    if (stamped) return fail('notes-residual', stamped.map(s => s.trim()).join('\n'))
    const left = tokens(notes)
    for (const t of segs.flatMap(tokens)) {
      const at = left.indexOf(t)
      if (at >= 0) left.splice(at, 1)
    }
    if (left.length) return fail('notes-residual', left.join(' / '))
    segs.forEach((s, i) => { perLineNotes[i] = s })
  }
  if (notes) {
    // Several different sizes inside text that will be copied to / kept by one line's units
    // cannot be told apart per unit.
    for (let i = 0; i < lines.length; i++) {
      if (Math.floor(lines[i].qty) > 1 && distinctSizes(perLineNotes[i] ?? '').size > 1) return fail('notes-multi-size', perLineNotes[i] ?? undefined)
    }
  }

  const assignments: SplitAssignment[] = units.map((unit, u) => ({
    unit,
    reuse: u === 0,
    product: unit.productName,
    variant: unit.variantName,
    notes: perLineNotes[lineOfUnit[u]],
    checklist: perUnitChecklist[u],
  }))
  return { ok: true, assignments }
}
