// Orchestration for splitting active combined WPs into one WP per unit. Every side effect
// (marketplace, DB, Discord, disk, clock) is injected through SplitDeps so the order of
// operations, the success criteria and the failure handling can be tested with mocks.
// See docs/superpowers/plans/2026-10-13-wp-per-item-stage3.md (Task 3).
import { planOrderSplit, pickLegacyWp, SPLITTABLE_STATUSES, type SplitWp, type SplitAssignment } from './order-split'
import { buildTitle } from './format'
import type { OrderLine, OrderUnit } from './order-units'

export type MarketSource = 'shopee' | 'tokopedia'

// A legacy combined WP row as the script sees it. Dates are ISO strings so the snapshot is plain
// JSON; extra DB columns may ride along (the snapshot keeps the whole row).
export interface CandidateWp extends SplitWp {
  source: MarketSource
  sourceOrderNo: string
  updatedAt: string
  title: string
  customer: string
  contact: string | null
  platform: string | null
  dueDate: string | null
  dueDateRaw: string | null
  orderDate: string | null
  shipping: string | null
  trackingNo: string | null
  payment: string
  mentions: string[]
  remindersSent: number[]
  appliedTags: string[]
  sourceProductId: string | null
  itemPrice: number | null
  [extra: string]: unknown
}

export interface UnitCreateInput {
  source: MarketSource
  sourceOrderNo: string
  sourceProductId?: string
  forumChannelId: string
  customer: string
  contact?: string
  platform?: string
  product: string
  variant?: string
  dueDateRaw?: string // ISO date when the legacy WP had a real due date, else the free-text one
  orderDateRaw?: string
  notes?: string
  mentions: string[]
  shipping?: string
  orderId: string
  sourceItemKey: string
  itemPrice: number
  initial: {
    status: string
    payment: string
    remindersSent: number[]
    appliedTags?: string[]
    trackingNo?: string
    checklist: SplitAssignment['checklist']
    mentionsInPost: false
  }
}
export interface UnitCreateResult { id: string; threadId: string | null; syncState: string; skipped: boolean }

export interface ConvertArgs {
  id: string
  expectedStatus: string
  expectedUpdatedAt: string
  data: {
    product: string; variant: string | null; title: string; notes: string | null
    checklist: SplitAssignment['checklist']
    sourceItemKey: string; itemPrice: number; sourceProductId: string | null
  }
}

export interface FetchedOrder { lines: OrderLine[]; subTotal?: number | null }

export interface SplitDeps {
  // Legacy rows (active, sourceItemKey null, with an order number) plus the unit keys of every
  // keyed WP per `${source}:${orderNo}`.
  loadCandidates(): Promise<{ legacy: CandidateWp[]; keyedByOrder: Map<string, string[]> }>
  // Missing map entries mean the marketplace no longer returns the order. May throw on fatal errors.
  fetchLines(orders: { source: MarketSource; sourceOrderNo: string }[]): Promise<Map<string, FetchedOrder>>
  forumForUnit(unit: OrderUnit): string
  loadWp(id: string): Promise<CandidateWp | null>
  createUnit(input: UnitCreateInput): Promise<UnitCreateResult>
  convertLegacy(args: ConvertArgs): Promise<number> // conditional updateMany -> affected count
  resync(id: string): Promise<{ discordSynced: boolean }>
  writeSnapshot(snapshot: SplitSnapshot): Promise<string> // idempotent overwrite, returns the file path
  deleteUnit(id: string, threadId: string | null): Promise<void>
  restoreLegacy(wp: CandidateWp): Promise<void> // writes the snapshot copy back (sourceItemKey null...)
  now(): Date
  sleep(ms: number): Promise<void>
  log(line: string): void
}

export interface SnapshotEntry {
  key: string // `${source}:${orderNo}`
  legacy: CandidateWp
  plan: { itemKey: string; product: string; variant: string | null; reuse: boolean }[]
  created: { id: string; threadId: string | null; itemKey: string }[]
  converted: boolean
  appliedAt: string // last time this run wrote anything for the order
}
export interface SplitSnapshot { version: 1; createdAt: string; entries: SnapshotEntry[] }

export interface SkipExample { order: string; detail?: string; notes?: string; checklist?: string[] }
export interface SplitReport {
  scanned: number
  plannable: { key: string; units: number; newThreads: number }[]
  totalNewThreads: number
  skips: Record<string, { count: number; examples: SkipExample[] }>
  budget: { shopeeBatches: number; tokopediaListRequests: string; tokopediaLookups: number }
  warnings: string[]
}
export interface ApplyOutcome {
  snapshotPath: string | null
  converted: string[]
  incomplete: { key: string; reason: string }[]
  changedSinceSnapshot: string[]
  needsResync: string[]
  aborted: boolean
}
export interface RunSplitResult { report: SplitReport; applied?: ApplyOutcome }

export interface RunSplitOpts { apply?: boolean; limit?: number; only?: string }

export const UNIT_GAP_MS = 1500
export const MAX_CONSECUTIVE_DISCORD_FAILURES = 3
const MAX_EXAMPLES = 5
const SHOPEE_BATCH = 50

const keyOf = (source: string, orderNo: string) => `${source}:${orderNo}`
const excerpt = (s: string | null, n = 160) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? undefined)

export async function runSplit(deps: SplitDeps, opts: RunSplitOpts = {}): Promise<RunSplitResult> {
  const { legacy, keyedByOrder } = await deps.loadCandidates()
  const report: SplitReport = {
    scanned: 0, plannable: [], totalNewThreads: 0, skips: {},
    budget: { shopeeBatches: 0, tokopediaListRequests: '', tokopediaLookups: 0 }, warnings: [],
  }
  const skip = (reason: string, wp: { sourceOrderNo: string; notes?: string | null; checklist?: SplitWp['checklist'] }, detail?: string) => {
    const bucket = (report.skips[reason] ??= { count: 0, examples: [] })
    bucket.count++
    if (bucket.examples.length < MAX_EXAMPLES) {
      bucket.examples.push({
        order: wp.sourceOrderNo, detail: excerpt(detail ?? null), notes: excerpt(wp.notes ?? null),
        checklist: wp.checklist?.filter(c => !c.deleted).map(c => `${c.done ? '[x]' : '[ ]'} ${c.text}`),
      })
    }
  }

  // Group by order; duplicate legacy WPs poison the whole order.
  const byOrder = new Map<string, CandidateWp[]>()
  for (const wp of legacy) {
    if (opts.only && wp.sourceOrderNo !== opts.only) continue
    const k = keyOf(wp.source, wp.sourceOrderNo)
    byOrder.set(k, [...(byOrder.get(k) ?? []), wp])
  }
  report.scanned = byOrder.size
  const singles: { key: string; wp: CandidateWp }[] = []
  for (const [key, wps] of byOrder) {
    const picked = pickLegacyWp(wps)
    if (!picked.ok) {
      skip(picked.reason, wps[0], wps.map(w => w.id).join(', '))
      continue
    }
    singles.push({ key, wp: picked.wp })
  }

  // Request budget (printed before anything is fetched).
  const shopeeCount = singles.filter(s => s.wp.source === 'shopee').length
  const tokoCount = singles.filter(s => s.wp.source === 'tokopedia').length
  report.budget.shopeeBatches = Math.ceil(shopeeCount / SHOPEE_BATCH)
  report.budget.tokopediaListRequests = tokoCount ? '3 tabs x pages of 50 (about 6-10 requests)' : '0'
  report.budget.tokopediaLookups = tokoCount // upper bound: order lookups for ones missing from the tabs

  const fetched = singles.length
    ? await deps.fetchLines(singles.map(s => ({ source: s.wp.source, sourceOrderNo: s.wp.sourceOrderNo })))
    : new Map<string, FetchedOrder>()

  const plans: { key: string; wp: CandidateWp; assignments: SplitAssignment[] }[] = []
  for (const { key, wp } of singles) {
    const got = fetched.get(key)
    if (!got) { skip(wp.source === 'tokopedia' ? 'not-in-tabs' : 'no-order', wp); continue }
    const plan = planOrderSplit(wp, got.lines, deps.forumForUnit)
    if (!plan.ok) { skip(plan.reason, wp, plan.detail); continue }
    // Keyed WPs that are not exactly the extra units of this plan mean someone (or another
    // process) already shaped this order; leftovers of an earlier partial run are fine.
    const allowed = new Set(plan.assignments.filter(a => !a.reuse).map(a => a.unit.itemKey))
    const foreign = (keyedByOrder.get(key) ?? []).filter(k => !allowed.has(k))
    if (foreign.length) { skip('mixed-order', wp, foreign.join(', ')); continue }
    if (wp.source === 'tokopedia' && got.subTotal != null) {
      const sum = plan.assignments.reduce((n, a) => n + a.unit.unitPrice, 0)
      if (sum !== got.subTotal) report.warnings.push(`${key}: subTotal ${got.subTotal} != sum of unit prices ${sum} (partial cancel is not detectable on Tokopedia)`)
    }
    plans.push({ key, wp, assignments: plan.assignments })
    report.plannable.push({ key, units: plan.assignments.length, newThreads: plan.assignments.length - 1 })
    report.totalNewThreads += plan.assignments.length - 1
  }

  if (!opts.apply) return { report }

  const todo = opts.limit != null ? plans.slice(0, Math.max(0, opts.limit)) : plans
  const outcome: ApplyOutcome = { snapshotPath: null, converted: [], incomplete: [], changedSinceSnapshot: [], needsResync: [], aborted: false }

  // Snapshot BEFORE any write.
  const snapshot: SplitSnapshot = {
    version: 1,
    createdAt: deps.now().toISOString(),
    entries: todo.map(p => ({
      key: p.key,
      legacy: JSON.parse(JSON.stringify(p.wp)) as CandidateWp,
      plan: p.assignments.map(a => ({ itemKey: a.unit.itemKey, product: a.product, variant: a.variant, reuse: a.reuse })),
      created: [], converted: false, appliedAt: deps.now().toISOString(),
    })),
  }
  outcome.snapshotPath = await deps.writeSnapshot(snapshot)
  const flush = async (entry: SnapshotEntry) => { entry.appliedAt = deps.now().toISOString(); await deps.writeSnapshot(snapshot) }

  let consecutiveFailures = 0
  let firstCreate = true
  for (let i = 0; i < todo.length; i++) {
    const { key, wp: snap, assignments } = todo[i]
    const entry = snapshot.entries[i]

    // (1) Re-verify against the live row.
    const cur = await deps.loadWp(snap.id)
    if (!cur || !SPLITTABLE_STATUSES.includes(cur.status) || cur.sourceItemKey !== null || cur.updatedAt !== snap.updatedAt
      || cur.status !== snap.status || cur.notes !== snap.notes || JSON.stringify(cur.checklist) !== JSON.stringify(snap.checklist)) {
      outcome.changedSinceSnapshot.push(key)
      continue
    }

    // (2) Extras first.
    let extrasOk = true
    let failReason = ''
    for (const a of assignments.filter(x => !x.reuse)) {
      if (!firstCreate) await deps.sleep(UNIT_GAP_MS)
      firstCreate = false
      const forum = deps.forumForUnit(a.unit)
      let res: UnitCreateResult | null = null
      let err: string | null = null
      try {
        res = await deps.createUnit(buildCreateInput(snap, a, forum))
      } catch (e) { err = (e as Error).message }
      // A row that was created (not skipped) is recorded even when its thread failed, so rollback can remove it.
      if (res && !res.skipped) { entry.created.push({ id: res.id, threadId: res.threadId, itemKey: a.unit.itemKey }); await flush(entry) }
      const ok = !!res && !!res.threadId && res.syncState === 'ok'
      if (ok) { consecutiveFailures = 0; continue }
      extrasOk = false
      failReason = `${a.unit.itemKey}: ${err ?? `syncState=${res?.syncState} thread=${res?.threadId ?? 'none'}`}`
      consecutiveFailures++
      break
    }
    if (!extrasOk) {
      outcome.incomplete.push({ key, reason: failReason })
      if (consecutiveFailures >= MAX_CONSECUTIVE_DISCORD_FAILURES) { outcome.aborted = true; break }
      continue
    }

    // (3) Convert the legacy WP last, conditionally; never forced.
    const first = assignments.find(x => x.reuse)!
    const count = await deps.convertLegacy({
      id: snap.id, expectedStatus: snap.status, expectedUpdatedAt: snap.updatedAt,
      data: {
        product: first.product, variant: first.variant,
        title: buildTitle({ customer: snap.customer, product: first.product, variant: first.variant }),
        notes: first.notes, checklist: first.checklist,
        sourceItemKey: first.unit.itemKey, itemPrice: first.unit.unitPrice, sourceProductId: first.unit.productId,
      },
    })
    if (count !== 1) { outcome.changedSinceSnapshot.push(key); continue }
    entry.converted = true
    outcome.converted.push(key)
    try {
      const r = await deps.resync(snap.id)
      if (!r.discordSynced) outcome.needsResync.push(key)
    } catch { outcome.needsResync.push(key) }
    await flush(entry)
  }
  return { report, applied: outcome }
}

function buildCreateInput(wp: CandidateWp, a: SplitAssignment, forum: string): UnitCreateInput {
  return {
    source: wp.source,
    sourceOrderNo: wp.sourceOrderNo,
    sourceProductId: a.unit.productId ?? undefined,
    forumChannelId: forum,
    customer: wp.customer,
    contact: wp.contact ?? undefined,
    platform: wp.platform ?? undefined,
    product: a.product,
    variant: a.variant ?? undefined,
    dueDateRaw: wp.dueDate ?? wp.dueDateRaw ?? undefined,
    orderDateRaw: wp.orderDate ?? undefined,
    notes: a.notes ?? undefined,
    mentions: wp.mentions,
    shipping: wp.shipping ?? undefined,
    orderId: wp.orderId as string,
    sourceItemKey: a.unit.itemKey,
    itemPrice: a.unit.unitPrice,
    initial: {
      status: wp.status,
      payment: wp.payment,
      remindersSent: wp.remindersSent,
      // Tags are forum-specific; copy them only when the unit lands in the legacy WP's forum.
      appliedTags: forum === wp.forumChannelId ? wp.appliedTags : undefined,
      trackingNo: wp.trackingNo ?? undefined,
      checklist: a.checklist,
      mentionsInPost: false,
    },
  }
}

// ---------------------------------------------------------------- rollback

export interface RollbackOpts { apply?: boolean; forceEdited?: boolean }
export interface RollbackReport {
  restored: string[]
  refused: { key: string; reason: string }[]
  notes: string[]
}

export const ROLLBACK_CANNOT_RESTORE = [
  'New unit threads are deleted together with their Discord messages/history.',
  'Edits made to the legacy WP or its units after the split (--force-edited overwrites them).',
  'Reminders or pings that were already sent from the split units.',
]

export async function runRollback(deps: SplitDeps, snapshots: SplitSnapshot[], opts: RollbackOpts = {}): Promise<RollbackReport> {
  const out: RollbackReport = { restored: [], refused: [], notes: ROLLBACK_CANNOT_RESTORE }
  for (const snap of [...snapshots].reverse()) {
    for (const entry of snap.entries) {
      const applied = Date.parse(entry.appliedAt)
      const edited: string[] = []
      const legacyNow = await deps.loadWp(entry.legacy.id)
      if (!legacyNow) { out.refused.push({ key: entry.key, reason: 'legacy-missing' }); continue }
      // An unconverted legacy row was never touched, so anything newer than the snapshot copy is an edit.
      const legacyThreshold = entry.converted ? applied : Date.parse(entry.legacy.updatedAt)
      if (Date.parse(legacyNow.updatedAt) > legacyThreshold) edited.push(`legacy ${legacyNow.id}`)
      const units: { id: string; threadId: string | null; row: CandidateWp | null }[] = []
      for (const c of entry.created) {
        const row = await deps.loadWp(c.id)
        units.push({ id: c.id, threadId: c.threadId, row })
        if (row && Date.parse(row.updatedAt) > applied) edited.push(`unit ${c.id}`)
      }
      if (edited.length && !opts.forceEdited) {
        out.refused.push({ key: entry.key, reason: `edited-since-apply: ${edited.join(', ')}` })
        continue
      }
      if (!opts.apply) { out.restored.push(entry.key); continue }
      for (const u of units) {
        // Only rows this run created, and only while they still are unit rows.
        if (!u.row || u.row.sourceItemKey === null) continue
        await deps.deleteUnit(u.id, u.row.discordThreadId ?? u.threadId)
      }
      if (entry.converted) {
        await deps.restoreLegacy(entry.legacy)
        try { await deps.resync(entry.legacy.id) } catch { out.notes = [...out.notes, `resync failed for ${entry.legacy.id}: run it manually`] }
      }
      out.restored.push(entry.key)
    }
  }
  return out
}
