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

// `status` is the raw marketplace status (Shopee order_status string, Tokopedia sku_display_status code).
export interface FetchedOrder { lines: OrderLine[]; subTotal?: number | null; status?: string | number | null }

// Orders the marketplace already cancelled/completed are not worth splitting: status-sync is about
// to mark the WP Canceled/Done anyway. Codes mirror classifyShopeeStatus/classifyTokopediaStatus
// (IN_CANCEL is not final yet, but a cancellation is pending so the order is left alone).
export function marketplaceStateOf(source: MarketSource, raw: string | number | null | undefined): 'cancelled' | 'completed' | null {
  if (source === 'shopee') {
    if (raw === 'CANCELLED' || raw === 'IN_CANCEL') return 'cancelled'
    if (raw === 'COMPLETED') return 'completed'
    return null
  }
  if (raw === 140) return 'cancelled'
  if (raw === 130) return 'completed'
  return null
}

// WHERE clause of the conditional legacy conversion: matches only the untouched row (still
// unkeyed, same status, same updatedAt as in the snapshot), so a concurrent edit makes the
// updateMany affect 0 rows instead of being overwritten.
export function legacyConvertWhere(a: Pick<ConvertArgs, 'id' | 'expectedStatus' | 'expectedUpdatedAt'>) {
  return { id: a.id, sourceItemKey: null, status: a.expectedStatus, updatedAt: new Date(a.expectedUpdatedAt) }
}

export interface KeyedRef { id: string; itemKey: string }

export interface SplitDeps {
  // Legacy rows (active, sourceItemKey null, with an order number) plus every keyed WP (id and
  // unit key, any status) per `${source}:${orderNo}`.
  loadCandidates(): Promise<{ legacy: CandidateWp[]; keyedByOrder: Map<string, KeyedRef[]> }>
  // Missing map entries mean the marketplace no longer returns the order. May throw on fatal errors.
  fetchLines(orders: { source: MarketSource; sourceOrderNo: string }[]): Promise<Map<string, FetchedOrder>>
  forumForUnit(unit: OrderUnit): string
  loadWp(id: string): Promise<CandidateWp | null>
  // Rows of an order carrying one of these unit keys (rollback lookup for rows a crashed run never recorded).
  findUnits(source: MarketSource, sourceOrderNo: string, itemKeys: string[]): Promise<CandidateWp[]>
  createUnit(input: UnitCreateInput): Promise<UnitCreateResult>
  convertLegacy(args: ConvertArgs): Promise<number> // conditional updateMany -> affected count
  resync(id: string): Promise<{ discordSynced: boolean }>
  writeSnapshot(snapshot: SplitSnapshot): Promise<string> // idempotent overwrite, returns the file path
  deleteUnit(id: string, threadId: string | null): Promise<{ discordDeleted: boolean }>
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
  // Units that already existed when this run found them (leftovers of an earlier partial run).
  adopted: { id: string; threadId: string | null; itemKey: string }[]
  // Every unit key of the plan (reused one included), written BEFORE any unit is created so a
  // crash between row creation and the next flush can still be rolled back by key lookup.
  plannedKeys: string[]
  // Ids of keyed WPs that existed before the run: never touched by the key lookup in rollback.
  preexistingKeyed: string[]
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
    const state = marketplaceStateOf(wp.source, got.status)
    if (state) { skip(`marketplace-${state}`, wp, `status=${got.status}`); continue }
    const plan = planOrderSplit(wp, got.lines, deps.forumForUnit)
    if (!plan.ok) { skip(plan.reason, wp, plan.detail); continue }
    // Units are all in one forum (cross-category is rejected); a different forum than the legacy
    // thread's would move the order between forums, which this tool does not do.
    const unitForum = deps.forumForUnit(plan.assignments[0].unit)
    if (unitForum !== wp.forumChannelId) { skip('forum-mismatch', wp, `units=${unitForum} legacy=${wp.forumChannelId}`); continue }
    // Keyed WPs that are not exactly the extra units of this plan mean someone (or another
    // process) already shaped this order; leftovers of an earlier partial run are fine.
    const allowed = new Set(plan.assignments.filter(a => !a.reuse).map(a => a.unit.itemKey))
    const foreign = (keyedByOrder.get(key) ?? []).map(k => k.itemKey).filter(k => !allowed.has(k))
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
      created: [], adopted: [],
      plannedKeys: p.assignments.map(a => a.unit.itemKey),
      preexistingKeyed: (keyedByOrder.get(p.key) ?? []).map(k => k.id),
      converted: false, appliedAt: deps.now().toISOString(),
    })),
  }
  outcome.snapshotPath = await deps.writeSnapshot(snapshot)
  const flush = async (entry: SnapshotEntry) => { entry.appliedAt = deps.now().toISOString(); await deps.writeSnapshot(snapshot) }
  const record = (list: SnapshotEntry['created'], r: { id: string; threadId: string | null }, itemKey: string) => {
    const at = list.findIndex(c => c.id === r.id)
    if (at >= 0) list[at] = { id: r.id, threadId: r.threadId, itemKey }
    else list.push({ id: r.id, threadId: r.threadId, itemKey })
  }

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

    // (2) Extras first. The plan (keys, preexisting rows) is persisted before the first create.
    await flush(entry)
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
      // An existing row is recorded as adopted so rollback of this run covers it too.
      if (res) { record(res.skipped ? entry.adopted : entry.created, res, a.unit.itemKey); await flush(entry) }
      let ok = !!res && !!res.threadId && res.syncState === 'ok'
      // An existing row with a thread whose last Discord refresh failed: push it again once; success
      // clears the error state so it cannot count as a failure on every run.
      if (!ok && res && res.skipped && res.threadId) {
        try { ok = (await deps.resync(res.id)).discordSynced } catch { ok = false }
        if (!ok) err = 'existing unit has a thread but resync failed'
      }
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
    // Persist the conversion right away: rollback decides from the live row, but the flag keeps
    // the edit check meaningful.
    entry.converted = true
    await flush(entry)
    outcome.converted.push(key)
    try {
      const r = await deps.resync(snap.id)
      if (!r.discordSynced) outcome.needsResync.push(key)
    } catch { outcome.needsResync.push(key) }
    // The resync touched the row (updatedAt); the final flush moves appliedAt past it.
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
  // Units whose DB row is gone but whose Discord thread could not be deleted: clean up by hand.
  discordNotDeleted: { id: string; threadId: string | null }[]
  notes: string[]
}

export const ROLLBACK_CANNOT_RESTORE = [
  'New unit threads are deleted together with their Discord messages/history.',
  'Edits made to the legacy WP or its units after the split (--force-edited overwrites them).',
  'Reminders or pings that were already sent from the split units.',
]

// Rolls back every order found in the given snapshot files. An order that appears in several
// files (a partial run completed by a later one) is processed ONCE: units are the union of what
// every file recorded, the legacy copy to restore comes from the OLDEST file, and edits are
// measured against the LATEST apply time (the tool's own later runs are not edits).
// Whether the legacy row was converted is read from the live row, never trusted from the flag.
export async function runRollback(deps: SplitDeps, snapshots: SplitSnapshot[], opts: RollbackOpts = {}): Promise<RollbackReport> {
  const out: RollbackReport = { restored: [], refused: [], discordNotDeleted: [], notes: ROLLBACK_CANNOT_RESTORE }
  const groups = new Map<string, SnapshotEntry[]>()
  for (const snap of [...snapshots].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    for (const entry of snap.entries) groups.set(entry.key, [...(groups.get(entry.key) ?? []), entry])
  }

  for (const [key, entries] of groups) {
    const oldest = entries[0]
    const legacyId = oldest.legacy.id
    const reuseKey = oldest.plan.find(p => p.reuse)?.itemKey ?? null
    const planned = new Set(entries.flatMap(e => e.plannedKeys ?? e.plan.map(p => p.itemKey)))
    // Only keys of the plan's extra units can ever be deleted.
    const extraKeys = new Set([...planned].filter(k => k !== reuseKey))
    const latestApply = Math.max(...entries.map(e => Date.parse(e.appliedAt)))
    const flagConverted = entries.some(e => e.converted)
    const preexisting = new Set(oldest.preexistingKeyed ?? [])
    const recorded = new Map<string, string | null>() // id -> recorded threadId
    for (const e of entries) for (const c of [...e.created, ...(e.adopted ?? [])]) recorded.set(c.id, c.threadId)

    const legacyNow = await deps.loadWp(legacyId)
    if (!legacyNow) { out.refused.push({ key, reason: 'legacy-missing' }); continue }
    const legacyConverted = reuseKey !== null && legacyNow.sourceItemKey === reuseKey

    // Units: recorded ids first, then everything the order has under a planned key that did not
    // exist before the first run (covers rows a crash never recorded).
    const units = new Map<string, { row: CandidateWp; wasRecorded: boolean }>()
    const consider = (row: CandidateWp | null, wasRecorded: boolean) => {
      if (!row || row.id === legacyId || row.source !== oldest.legacy.source || row.sourceOrderNo !== oldest.legacy.sourceOrderNo) return
      if (row.sourceItemKey === null || !extraKeys.has(row.sourceItemKey)) return // never a non-planned row
      if (!units.has(row.id)) units.set(row.id, { row, wasRecorded })
    }
    for (const id of recorded.keys()) consider(await deps.loadWp(id), true)
    for (const row of await deps.findUnits(oldest.legacy.source, oldest.legacy.sourceOrderNo, [...extraKeys])) {
      if (!preexisting.has(row.id)) consider(row, recorded.has(row.id))
    }

    const edited: string[] = []
    if (legacyConverted) {
      // With no converted flag in any file the conversion happened but was never flushed: nothing to compare against.
      if (flagConverted && Date.parse(legacyNow.updatedAt) > latestApply) edited.push(`legacy ${legacyId}`)
    } else if (Date.parse(legacyNow.updatedAt) > Date.parse(oldest.legacy.updatedAt)) {
      edited.push(`legacy ${legacyId}`)
    }
    for (const [id, u] of units) {
      // Rows a crashed run never recorded cannot be checked for edits (no apply time was persisted).
      if (u.wasRecorded && Date.parse(u.row.updatedAt) > latestApply) edited.push(`unit ${id}`)
      if (!SPLITTABLE_STATUSES.includes(u.row.status)) edited.push(`unit ${id} status ${u.row.status}`)
    }
    // Restoring and deleting are one decision: an order is never left with its units gone but its
    // converted legacy row unrestored (or the other way around).
    if (edited.length && !opts.forceEdited) {
      out.refused.push({ key, reason: `edited-since-apply: ${edited.join(', ')}` })
      continue
    }
    if (!opts.apply) { out.restored.push(key); continue }

    // Restore first: a failure here leaves the units in place and the order consistent.
    if (legacyConverted) {
      await deps.restoreLegacy(oldest.legacy)
      try { await deps.resync(legacyId) } catch { out.notes = [...out.notes, `resync failed for ${legacyId}: run it manually`] }
    }
    let failed: string | null = null
    for (const [id, u] of units) {
      try {
        const r = await deps.deleteUnit(id, u.row.discordThreadId ?? recorded.get(id) ?? null)
        if (!r.discordDeleted) out.discordNotDeleted.push({ id, threadId: u.row.discordThreadId ?? recorded.get(id) ?? null })
      } catch (e) { failed = `delete-failed ${id}: ${(e as Error).message}`; break }
    }
    if (failed) { out.refused.push({ key, reason: failed }); continue }
    out.restored.push(key)
  }
  return out
}
