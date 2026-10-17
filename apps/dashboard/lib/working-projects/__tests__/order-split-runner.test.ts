import { describe, it, expect, vi } from 'vitest'
import {
  runSplit, runRollback, legacyConvertWhere, marketplaceStateOf,
  type SplitDeps, type CandidateWp, type SplitSnapshot, type UnitCreateResult, type FetchedOrder, type KeyedRef,
} from '../order-split-runner'
import { SPLITTABLE_STATUSES } from '../order-split'
import type { OrderLine } from '../order-units'

const P1 = 'Green Lantern Ring 2026 3D Print'
const ORDER = '586311573917172770'
const KEY = `shopee:${ORDER}`
const FORUM = 'forum-cincin'
const T0 = '2026-10-10T00:00:00.000Z'
const CLOCK0 = Date.parse('2026-10-14T00:00:00.000Z')

const line = (key: string, variant: string, qty = 1): OrderLine =>
  ({ key, productName: P1, variantName: variant, qty, unitPrice: 100000, productId: `p-${key}` })
const twoSizes = [line('L1', '7'), line('L2', '13')]
const threeSizes = [line('L1', '7'), line('L2', '13'), line('L3', '9')]

function wp(over: Partial<CandidateWp> = {}): CandidateWp {
  return {
    id: 'wp1', source: 'shopee', sourceOrderNo: ORDER, product: `${P1} (7), ${P1} (13)`, variant: null, notes: null,
    status: 'Proses', checklist: [], sourceItemKey: null, orderId: 'ord1', discordThreadId: 't-legacy',
    forumChannelId: FORUM, updatedAt: T0, title: `Budi - ${P1} (7), ${P1} (13)`, customer: 'Budi', contact: null,
    platform: 'Shopee', dueDate: '2026-10-20T00:00:00.000Z', dueDateRaw: null, orderDate: '2026-10-01T00:00:00.000Z',
    shipping: 'JNE', trackingNo: 'JP123', payment: 'Lunas', mentions: ['u1'], remindersSent: [3], appliedTags: ['tag1'],
    sourceProductId: null, itemPrice: null, syncState: 'ok', ...over,
  }
}

class Crash extends Error {}

// A small stateful fake of the DB + Discord. The clock advances on every read, so updatedAt /
// appliedAt comparisons (edit detection) are really exercised.
function makeWorld(init: {
  rows?: CandidateWp[]
  lines?: Record<string, OrderLine[]>
  statuses?: Record<string, string | number | null>
} = {}) {
  const rows = new Map<string, CandidateWp>((init.rows ?? [wp()]).map(r => [r.id, structuredClone(r)]))
  const lines = init.lines ?? { [KEY]: twoSizes }
  let tick = 0
  let seq = 0
  const w = {
    rows,
    ops: [] as string[],
    files: new Map<string, SplitSnapshot>(),
    writes: [] as SplitSnapshot[],
    deleted: [] as string[],
    discordDeleteOk: true,
    resyncOk: (_id: string) => true,
    // 'ok' creates a threaded row; 'nothread' leaves it errored without a thread; 'throw' throws after inserting the row.
    createMode: (_key: string): 'ok' | 'nothread' | 'throw' => 'ok',
    failWrite: null as null | ((s: SplitSnapshot) => boolean),
    now: () => new Date(CLOCK0 + (tick++) * 1000),
    edit(id: string, patch: Partial<CandidateWp> = {}) { Object.assign(rows.get(id)!, patch, { updatedAt: w.now().toISOString() }) },
    unit(key: string) { return [...rows.values()].find(r => r.sourceItemKey === key) },
    lastSnapshot() { return [...w.files.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)! },
    allSnapshots() { return [...w.files.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) },
  }
  const touch = (r: CandidateWp) => { r.updatedAt = w.now().toISOString() }
  const deps: SplitDeps = {
    loadCandidates: async () => {
      const legacy = [...rows.values()].filter(r => r.sourceItemKey === null && SPLITTABLE_STATUSES.includes(r.status)).map(r => structuredClone(r))
      const keyedByOrder = new Map<string, KeyedRef[]>()
      for (const r of rows.values()) if (r.sourceItemKey) keyedByOrder.set(`${r.source}:${r.sourceOrderNo}`, [...(keyedByOrder.get(`${r.source}:${r.sourceOrderNo}`) ?? []), { id: r.id, itemKey: r.sourceItemKey }])
      return { legacy, keyedByOrder }
    },
    fetchLines: async (orders) => {
      w.ops.push('fetch')
      const m = new Map<string, FetchedOrder>()
      for (const o of orders) {
        const k = `${o.source}:${o.sourceOrderNo}`
        if (lines[k]) m.set(k, { lines: lines[k], status: init.statuses?.[k] })
      }
      return m
    },
    forumForUnit: () => FORUM,
    loadWp: async (id) => { const r = rows.get(id); return r ? structuredClone(r) : null },
    findUnits: async (source, orderNo, keys) => [...rows.values()].filter(r => r.source === source && r.sourceOrderNo === orderNo && r.sourceItemKey && keys.includes(r.sourceItemKey)).map(r => structuredClone(r)),
    createUnit: async (input): Promise<UnitCreateResult> => {
      w.ops.push(`create:${input.sourceItemKey}`)
      const have = [...rows.values()].find(r => r.source === input.source && r.sourceOrderNo === input.sourceOrderNo && r.sourceItemKey === input.sourceItemKey)
      if (have) return { id: have.id, threadId: have.discordThreadId, syncState: have.syncState as string, skipped: true }
      const mode = w.createMode(input.sourceItemKey)
      const id = `new${++seq}`
      const row = wp({
        id, sourceItemKey: input.sourceItemKey, discordThreadId: mode === 'ok' ? `th${seq}` : null,
        syncState: mode === 'ok' ? 'ok' : 'error', status: input.initial.status, product: input.product, variant: input.variant ?? null,
      })
      rows.set(id, row); touch(row)
      if (mode === 'throw') throw new Error('relay exploded')
      return { id, threadId: row.discordThreadId, syncState: row.syncState as string, skipped: false }
    },
    convertLegacy: async (a) => {
      w.ops.push('convert')
      const r = rows.get(a.id)
      if (!r || r.sourceItemKey !== null || r.status !== a.expectedStatus || r.updatedAt !== a.expectedUpdatedAt) return 0
      Object.assign(r, a.data); touch(r)
      return 1
    },
    resync: async (id) => {
      w.ops.push(`resync:${id}`)
      const r = rows.get(id)!
      touch(r)
      const ok = w.resyncOk(id)
      if (ok) r.syncState = 'ok'
      return { discordSynced: ok }
    },
    writeSnapshot: async (s) => {
      if (w.failWrite?.(s)) throw new Crash('killed')
      const path = `/snap/split-${s.createdAt}.json`
      w.ops.push(`snapshot${s.entries.some(e => e.converted) ? ':converted' : ''}`)
      w.files.set(path, structuredClone(s))
      w.writes.push(structuredClone(s))
      return path
    },
    deleteUnit: async (id) => { w.ops.push(`delete:${id}`); rows.delete(id); w.deleted.push(id); return { discordDeleted: w.discordDeleteOk } },
    restoreLegacy: async (snap) => {
      w.ops.push(`restore:${snap.id}`)
      const r = rows.get(snap.id)!
      Object.assign(r, { product: snap.product, variant: snap.variant, title: snap.title, notes: snap.notes, checklist: snap.checklist, sourceItemKey: null, itemPrice: null })
      touch(r)
    },
    now: () => w.now(),
    sleep: async (ms) => { w.ops.push(`sleep:${ms}`) },
    log: () => {},
  }
  return { w, deps }
}

describe('helpers', () => {
  it('marketplaceStateOf maps cancelled/completed per marketplace', () => {
    expect(marketplaceStateOf('shopee', 'CANCELLED')).toBe('cancelled')
    expect(marketplaceStateOf('shopee', 'IN_CANCEL')).toBe('cancelled')
    expect(marketplaceStateOf('shopee', 'COMPLETED')).toBe('completed')
    expect(marketplaceStateOf('shopee', 'SHIPPED')).toBeNull()
    expect(marketplaceStateOf('tokopedia', 140)).toBe('cancelled')
    expect(marketplaceStateOf('tokopedia', 130)).toBe('completed')
    expect(marketplaceStateOf('tokopedia', 121)).toBeNull()
    expect(marketplaceStateOf('tokopedia', undefined)).toBeNull()
  })

  it('legacyConvertWhere only matches the untouched, unkeyed row', () => {
    expect(legacyConvertWhere({ id: 'wp1', expectedStatus: 'Proses', expectedUpdatedAt: T0 })).toEqual({
      id: 'wp1', sourceItemKey: null, status: 'Proses', updatedAt: new Date(T0),
    })
  })
})

describe('runSplit - dry run', () => {
  it('writes nothing and reports plannable orders, budget and thread count', async () => {
    const { w, deps } = makeWorld()
    const { report, applied } = await runSplit(deps, {})
    expect(applied).toBeUndefined()
    expect(w.ops).toEqual(['fetch'])
    expect(report.plannable).toEqual([{ key: KEY, units: 2, newThreads: 1 }])
    expect(report.totalNewThreads).toBe(1)
    expect(report.budget.shopeeBatches).toBe(1)
  })

  it('reports skip reasons with examples (order no, notes excerpt, checklist labels)', async () => {
    const { deps } = makeWorld({ rows: [wp({ notes: 'catatan umum tanpa pemisah', checklist: [{ text: 'Print', done: true }] })] })
    const { report } = await runSplit(deps, {})
    expect(report.plannable).toEqual([])
    const s = report.skips['notes-unmappable'] ?? report.skips['checklist-unmappable']
    expect(s.count).toBe(1)
    expect(s.examples[0].order).toBe(ORDER)
    expect(s.examples[0].notes).toContain('catatan umum')
    expect(s.examples[0].checklist).toEqual(['[x] Print'])
  })

  it('skips the whole order on duplicate-legacy', async () => {
    const { deps } = makeWorld({ rows: [wp(), wp({ id: 'wp2' })] })
    const { report } = await runSplit(deps, {})
    expect(report.skips['duplicate-legacy'].count).toBe(1)
    expect(report.plannable).toEqual([])
  })

  it('skips the order as mixed-order when an unrelated keyed WP exists', async () => {
    const { deps } = makeWorld({ rows: [wp(), wp({ id: 'zzz', sourceItemKey: 'ZZZ#1' })] })
    const { report } = await runSplit(deps, {})
    expect(report.skips['mixed-order'].count).toBe(1)
  })

  it('reports not-in-tabs for a Tokopedia order the marketplace no longer lists', async () => {
    const { deps } = makeWorld({ rows: [wp({ source: 'tokopedia' })], lines: {} })
    const { report } = await runSplit(deps, {})
    expect(report.skips['not-in-tabs'].count).toBe(1)
  })

  it.each([
    ['shopee', 'CANCELLED', 'marketplace-cancelled'],
    ['shopee', 'IN_CANCEL', 'marketplace-cancelled'],
    ['shopee', 'COMPLETED', 'marketplace-completed'],
    ['tokopedia', 140, 'marketplace-cancelled'],
    ['tokopedia', 130, 'marketplace-completed'],
  ] as const)('skips a %s order with status %s as %s', async (source, status, reason) => {
    const k = `${source}:${ORDER}`
    const { deps } = makeWorld({ rows: [wp({ source })], lines: { [k]: twoSizes }, statuses: { [k]: status } })
    const { report } = await runSplit(deps, {})
    expect(report.skips[reason].count).toBe(1)
    expect(report.plannable).toEqual([])
  })

  it('does not skip a shipped order', async () => {
    const { deps } = makeWorld({ statuses: { [KEY]: 'SHIPPED' } })
    const { report } = await runSplit(deps, {})
    expect(report.plannable).toHaveLength(1)
  })

  it('skips as forum-mismatch (with both forum ids) when the units belong to another forum', async () => {
    const { deps } = makeWorld({ rows: [wp({ forumChannelId: 'forum-lain' })] })
    const { report } = await runSplit(deps, {})
    expect(report.skips['forum-mismatch'].count).toBe(1)
    expect(report.skips['forum-mismatch'].examples[0].detail).toContain(FORUM)
    expect(report.skips['forum-mismatch'].examples[0].detail).toContain('forum-lain')
  })

  it('keeps cross-category for units that differ among themselves', async () => {
    const { deps } = makeWorld()
    let n = 0
    deps.forumForUnit = () => (n++ % 2 ? 'a' : 'b')
    const { report } = await runSplit(deps, {})
    expect(report.skips['cross-category'].count).toBe(1)
  })
})

describe('runSplit - apply', () => {
  it('snapshots first (with the plan), creates extras, converts the legacy WP last', async () => {
    const { w, deps } = makeWorld()
    const { applied } = await runSplit(deps, { apply: true })
    const ops = w.ops
    expect(ops.indexOf('snapshot')).toBeLessThan(ops.findIndex(o => o.startsWith('create:')))
    expect(ops.findIndex(o => o.startsWith('create:'))).toBeLessThan(ops.indexOf('convert'))
    expect(ops.indexOf('convert')).toBeLessThan(ops.indexOf('resync:wp1'))
    expect(applied!.converted).toEqual([KEY])
    const first = w.writes[0]
    expect(first.entries[0]).toMatchObject({ plannedKeys: ['L1#1', 'L2#1'], preexistingKeyed: [], created: [], adopted: [] })
    const last = w.lastSnapshot().entries[0]
    expect(last.created).toEqual([{ id: 'new1', threadId: 'th1', itemKey: 'L2#1' }])
    expect(last.converted).toBe(true)
  })

  it('persists the planned keys again right before the first create of an order', async () => {
    const { w, deps } = makeWorld()
    await runSplit(deps, { apply: true })
    // snapshot (initial), snapshot (pre-create flush), create, snapshot (after create), convert ...
    const firstCreate = w.ops.findIndex(o => o.startsWith('create:'))
    expect(w.ops.slice(0, firstCreate).filter(o => o === 'snapshot').length).toBeGreaterThanOrEqual(2)
  })

  it('flushes converted:true right after the conversion, before the resync', async () => {
    const { w, deps } = makeWorld()
    await runSplit(deps, { apply: true })
    const convert = w.ops.indexOf('convert')
    expect(w.ops[convert + 1]).toBe('snapshot:converted')
    expect(w.ops[convert + 2]).toBe('resync:wp1')
  })

  it('passes inherited state to the new unit without pinging', async () => {
    const seen: unknown[] = []
    const { deps } = makeWorld()
    deps.createUnit = async (i) => { seen.push(i); return { id: 'n', threadId: 't', syncState: 'ok', skipped: false } }
    await runSplit(deps, { apply: true })
    expect(seen[0]).toMatchObject({
      sourceItemKey: 'L2#1', variant: '13', itemPrice: 100000, forumChannelId: FORUM, dueDateRaw: '2026-10-20T00:00:00.000Z',
      initial: { status: 'Proses', payment: 'Lunas', remindersSent: [3], appliedTags: ['tag1'], trackingNo: 'JP123', mentionsInPost: false },
      mentions: ['u1'],
    })
  })

  it('does not convert when an extra returns syncState error without throwing', async () => {
    const { w, deps } = makeWorld()
    w.createMode = () => 'nothread'
    const { applied } = await runSplit(deps, { apply: true })
    expect(w.ops).not.toContain('convert')
    expect(applied!.converted).toEqual([])
    expect(applied!.incomplete[0].key).toBe(KEY)
  })

  it('does not convert when an extra is pending with no thread', async () => {
    const { w, deps } = makeWorld()
    deps.createUnit = async () => ({ id: 'n1', threadId: null, syncState: 'pending', skipped: true })
    await runSplit(deps, { apply: true })
    expect(w.ops).not.toContain('convert')
  })

  it('records an existing threaded unit as adopted (not created) and counts it as success', async () => {
    const { w, deps } = makeWorld({ rows: [wp(), wp({ id: 'old', sourceItemKey: 'L2#1', discordThreadId: 'th-old', updatedAt: T0 })] })
    const { applied } = await runSplit(deps, { apply: true })
    expect(w.ops).toContain('convert')
    expect(applied!.converted).toHaveLength(1)
    const e = w.lastSnapshot().entries[0]
    expect(e.created).toEqual([])
    expect(e.adopted).toEqual([{ id: 'old', threadId: 'th-old', itemKey: 'L2#1' }])
    expect(e.preexistingKeyed).toEqual(['old'])
  })

  it('existing row with a thread but syncState error: resyncs it and counts success', async () => {
    const { w, deps } = makeWorld({ rows: [wp(), wp({ id: 'old', sourceItemKey: 'L2#1', discordThreadId: 'th-old', syncState: 'error' })] })
    const { applied } = await runSplit(deps, { apply: true })
    expect(w.ops).toContain('resync:old')
    expect(applied!.converted).toEqual([KEY])
    expect(w.rows.get('old')!.syncState).toBe('ok')
  })

  it('such a row is not retried forever: a second run needs no resync of it', async () => {
    const { w, deps } = makeWorld({ rows: [wp(), wp({ id: 'old', sourceItemKey: 'L2#1', discordThreadId: 'th-old', syncState: 'error' })] })
    await runSplit(deps, { apply: true })
    w.ops.length = 0
    // legacy is converted now, so a re-run finds nothing to do and never touches it again
    const second = await runSplit(deps, { apply: true })
    expect(second.applied!.converted).toEqual([])
    expect(w.ops).not.toContain('resync:old')
  })

  it('existing row with a thread whose resync keeps failing stays a failure (no convert)', async () => {
    const { w, deps } = makeWorld({ rows: [wp(), wp({ id: 'old', sourceItemKey: 'L2#1', discordThreadId: 'th-old', syncState: 'error' })] })
    w.resyncOk = (id) => id !== 'old'
    const { applied } = await runSplit(deps, { apply: true })
    expect(w.ops).not.toContain('convert')
    expect(applied!.incomplete[0].reason).toContain('L2#1')
  })

  it('records a created row whose thread failed so rollback can remove it', async () => {
    const { w, deps } = makeWorld()
    w.createMode = () => 'nothread'
    await runSplit(deps, { apply: true })
    expect(w.lastSnapshot().entries[0].created).toEqual([{ id: 'new1', threadId: null, itemKey: 'L2#1' }])
  })

  it('stops after 3 consecutive Discord failures', async () => {
    const rows = [1, 2, 3, 4, 5].map(i => wp({ id: `w${i}`, sourceOrderNo: `O${i}`, orderId: `o${i}` }))
    const lines = Object.fromEntries(rows.map(r => [`shopee:${r.sourceOrderNo}`, twoSizes]))
    const { deps } = makeWorld({ rows, lines })
    const create = vi.fn(async () => ({ id: 'n', threadId: null, syncState: 'error', skipped: false }))
    deps.createUnit = create
    const { applied } = await runSplit(deps, { apply: true })
    expect(create).toHaveBeenCalledTimes(3)
    expect(applied!.aborted).toBe(true)
  })

  it('a thrown createUnit counts as a failure and does not convert', async () => {
    const { w, deps } = makeWorld()
    w.createMode = () => 'throw'
    const { applied } = await runSplit(deps, { apply: true })
    expect(w.ops).not.toContain('convert')
    expect(applied!.incomplete[0].reason).toContain('relay exploded')
  })

  it('reports changed-since-snapshot when the live row differs, without writing', async () => {
    const { w, deps } = makeWorld()
    const loaded = deps.loadCandidates
    deps.loadCandidates = async () => { const r = await loaded(); w.edit('wp1'); return r }
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.changedSinceSnapshot).toEqual([KEY])
    expect(w.ops.some(o => o.startsWith('create:') || o === 'convert')).toBe(false)
  })

  it('reports changed-since-snapshot (no force) when the conditional convert affects != 1 row', async () => {
    const { w, deps } = makeWorld()
    deps.convertLegacy = async () => 0
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.changedSinceSnapshot).toEqual([KEY])
    expect(applied!.converted).toEqual([])
    expect(w.ops.some(o => o.startsWith('resync'))).toBe(false)
  })

  it('a resync failure after conversion is listed, not fatal', async () => {
    const { w, deps } = makeWorld()
    w.resyncOk = () => false
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.converted).toHaveLength(1)
    expect(applied!.needsResync).toEqual([KEY])
  })

  it('re-run after a partial failure only creates the missing unit', async () => {
    const rows = [wp({ product: `${P1} (7), ${P1} (13), ${P1} (9)` })]
    const lines = { [KEY]: threeSizes }
    const { w, deps } = makeWorld({ rows, lines })
    w.createMode = (k) => (k === 'L3#1' ? 'nothread' : 'ok')
    await runSplit(deps, { apply: true })
    expect(w.unit('L2#1')).toBeDefined()
    w.createMode = () => 'ok'
    // the errored L3#1 row (no thread) is retried by the real createWorkingProject; the fake just recreates it
    w.rows.delete([...w.rows.values()].find(r => r.sourceItemKey === 'L3#1')!.id)
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.converted).toHaveLength(1)
    const e = w.lastSnapshot().entries[0]
    expect(e.created.map(c => c.itemKey)).toEqual(['L3#1'])
    expect(e.adopted.map(c => c.itemKey)).toEqual(['L2#1'])
  })

  it('--limit processes only the first n orders and --only filters by order number', async () => {
    const mk = () => {
      const rows = [1, 2, 3].map(i => wp({ id: `w${i}`, sourceOrderNo: `O${i}`, orderId: `o${i}` }))
      return { rows, lines: Object.fromEntries(rows.map(r => [`shopee:${r.sourceOrderNo}`, twoSizes])) }
    }
    const a = makeWorld(mk())
    const r1 = await runSplit(a.deps, { apply: true, limit: 2 })
    expect(r1.applied!.converted).toHaveLength(2)
    expect(r1.report.plannable).toHaveLength(3)
    const b = makeWorld(mk())
    const r2 = await runSplit(b.deps, { apply: true, only: 'O2' })
    expect(r2.applied!.converted).toEqual(['shopee:O2'])
    expect(r2.report.scanned).toBe(1)
  })
})

describe('runRollback', () => {
  async function applied(init: Parameters<typeof makeWorld>[0] = {}) {
    const world = makeWorld(init)
    await runSplit(world.deps, { apply: true })
    world.w.ops.length = 0
    return world
  }

  it('dry-run deletes nothing', async () => {
    const { w, deps } = await applied()
    const r = await runRollback(deps, w.allSnapshots(), {})
    expect(r.restored).toEqual([KEY])
    expect(w.ops).toEqual([])
  })

  it('apply restores the legacy row, resyncs, deletes the created unit; the tool\'s own resync is not an edit', async () => {
    const { w, deps } = await applied()
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.refused).toEqual([])
    expect(r.restored).toEqual([KEY])
    expect(w.ops).toEqual(['restore:wp1', 'resync:wp1', 'delete:new1'])
    expect(w.rows.get('wp1')!.sourceItemKey).toBeNull()
    expect(r.notes.length).toBeGreaterThan(0)
  })

  it('refuses the whole order when a unit was edited after apply, unless forceEdited', async () => {
    const { w, deps } = await applied()
    w.edit('new1')
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.refused[0].reason).toContain('edited-since-apply')
    expect(w.ops).toEqual([])
    const r2 = await runRollback(deps, w.allSnapshots(), { apply: true, forceEdited: true })
    expect(r2.restored).toEqual([KEY])
    expect(w.ops).toContain('delete:new1')
  })

  it('refuses the whole order (deletes nothing) when the converted legacy row was edited', async () => {
    const { w, deps } = await applied()
    w.edit('wp1')
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.refused[0].reason).toContain('legacy wp1')
    expect(w.ops).toEqual([])
    expect(w.rows.has('new1')).toBe(true)
  })

  it('decides "converted" from the live legacy row, not the snapshot flag', async () => {
    const { w, deps } = await applied()
    const snaps = w.allSnapshots()
    snaps.forEach(s => s.entries.forEach(e => { e.converted = false })) // flag lost
    await runRollback(deps, snaps, { apply: true })
    expect(w.ops).toContain('restore:wp1')
    expect(w.ops).toContain('delete:new1')
  })

  it('does not restore a legacy row that was never converted, only removes the extras', async () => {
    const { w, deps } = makeWorld()
    w.createMode = (k) => (k === 'L2#1' ? 'nothread' : 'ok')
    await runSplit(deps, { apply: true }) // extra created, thread failed, legacy untouched
    w.ops.length = 0
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.restored).toEqual([KEY])
    expect(w.ops).toEqual(['delete:new1'])
  })

  it('surfaces a Discord thread that could not be deleted', async () => {
    const { w, deps } = await applied()
    w.discordDeleteOk = false
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.discordNotDeleted).toEqual([{ id: 'new1', threadId: 'th1' }])
    expect(r.restored).toEqual([KEY])
  })

  it('never deletes a row whose key is not one of the planned extra keys', async () => {
    const { w, deps } = await applied()
    w.rows.set('other', wp({ id: 'other', sourceItemKey: 'ZZZ#1', discordThreadId: 'th-z' }))
    // even if a (tampered/old) snapshot lists it as created
    const snaps = w.allSnapshots()
    snaps[0].entries[0].created.push({ id: 'other', threadId: 'th-z', itemKey: 'ZZZ#1' })
    snaps[0].entries[0].adopted.push({ id: 'other', threadId: 'th-z', itemKey: 'ZZZ#1' })
    await runRollback(deps, snaps, { apply: true })
    expect(w.rows.has('other')).toBe(true)
    expect(w.deleted).toEqual(['new1'])
  })

  it('refuses to delete an adopted unit that is no longer active', async () => {
    const { w, deps } = makeWorld({ rows: [wp(), wp({ id: 'old', sourceItemKey: 'L2#1', discordThreadId: 'th-old', status: 'Done' })] })
    deps.loadCandidates = async () => ({ legacy: [wp()], keyedByOrder: new Map([[KEY, [{ id: 'old', itemKey: 'L2#1' }]]]) })
    await runSplit(deps, { apply: true })
    const r = await runRollback(deps, w.allSnapshots(), { apply: true })
    expect(r.refused[0].reason).toContain('status Done')
    expect(w.rows.has('old')).toBe(true)
  })

  describe('crash windows', () => {
    it('killed right after the conditional conversion, before any flush', async () => {
      const { w, deps } = makeWorld()
      w.failWrite = (s) => s.entries.some(e => e.converted)
      await expect(runSplit(deps, { apply: true })).rejects.toBeInstanceOf(Crash)
      w.failWrite = null
      // DB: unit exists, legacy converted; snapshot file: converted false
      expect(w.rows.get('wp1')!.sourceItemKey).toBe('L1#1')
      expect(w.lastSnapshot().entries[0].converted).toBe(false)
      w.ops.length = 0
      const r = await runRollback(deps, w.allSnapshots(), { apply: true })
      expect(r.refused).toEqual([])
      expect(w.ops).toEqual(['restore:wp1', 'resync:wp1', 'delete:new1'])
      expect(w.rows.get('wp1')!.sourceItemKey).toBeNull()
    })

    it('killed between row creation and the flush that records it', async () => {
      const { w, deps } = makeWorld()
      w.failWrite = (s) => s.entries.some(e => e.created.length > 0)
      await expect(runSplit(deps, { apply: true })).rejects.toBeInstanceOf(Crash)
      w.failWrite = null
      expect(w.unit('L2#1')).toBeDefined()
      expect(w.lastSnapshot().entries[0].created).toEqual([]) // never recorded
      w.ops.length = 0
      const r = await runRollback(deps, w.allSnapshots(), { apply: true })
      expect(r.refused).toEqual([])
      expect(w.ops).toEqual(['delete:new1']) // found by planned key; legacy was never converted
      expect(w.rows.get('wp1')!.sourceItemKey).toBeNull()
    })

    it('key lookup skips keyed rows that already existed before the run', async () => {
      const rows = [wp({ product: `${P1} (7), ${P1} (13), ${P1} (9)` }), wp({ id: 'pre', sourceItemKey: 'L3#1', status: 'Done', discordThreadId: 'th-pre' })]
      const { w, deps } = makeWorld({ rows, lines: { [KEY]: threeSizes } })
      // crash after the first extra (L2#1) was created, before L3#1 (pre-existing, Done) is reached
      w.failWrite = (s) => s.entries.some(e => e.created.length > 0)
      await expect(runSplit(deps, { apply: true })).rejects.toBeInstanceOf(Crash)
      w.failWrite = null
      expect(w.lastSnapshot().entries[0].preexistingKeyed).toEqual(['pre'])
      await runRollback(deps, w.allSnapshots(), { apply: true })
      expect(w.rows.has('pre')).toBe(true)
      expect(w.unit('L2#1')).toBeUndefined()
    })
  })

  describe('several snapshot files of the same order', () => {
    async function partialThenComplete() {
      const rows = [wp({ product: `${P1} (7), ${P1} (13), ${P1} (9)` })]
      const world = makeWorld({ rows, lines: { [KEY]: threeSizes } })
      const { w, deps } = world
      w.createMode = (k) => (k === 'L3#1' ? 'nothread' : 'ok')
      await runSplit(deps, { apply: true }) // run 1: L2 created, L3 failed, legacy untouched
      w.rows.delete([...w.rows.values()].find(r => r.sourceItemKey === 'L3#1')!.id) // (real code would retry the thread)
      w.createMode = () => 'ok'
      await runSplit(deps, { apply: true }) // run 2: adopts L2, creates L3, converts
      w.ops.length = 0
      return world
    }

    it('processes the order once, using the union of units and the oldest legacy copy', async () => {
      const { w, deps } = await partialThenComplete()
      const snaps = w.allSnapshots()
      expect(snaps).toHaveLength(2)
      const r = await runRollback(deps, [snaps[1], snaps[0]], { apply: true }) // order of arguments does not matter
      expect(r.refused).toEqual([])
      expect(r.restored).toEqual([KEY])
      expect(w.ops.filter(o => o.startsWith('restore:'))).toEqual(['restore:wp1'])
      expect(w.ops.filter(o => o.startsWith('delete:')).sort()).toHaveLength(2)
      expect(w.rows.get('wp1')!.sourceItemKey).toBeNull()
      expect(w.rows.get('wp1')!.product).toBe(`${P1} (7), ${P1} (13), ${P1} (9)`)
      expect([...w.rows.values()].filter(r => r.sourceItemKey)).toEqual([])
    })

    it('passing only the older file is not refused for the later run\'s own updates and cleans up by planned keys', async () => {
      const { w, deps } = await partialThenComplete()
      const r = await runRollback(deps, [w.allSnapshots()[0]], { apply: true })
      // file 1 never saw the conversion (flag false), so the live row decides: restore + delete both extras
      expect(r.refused).toEqual([])
      expect(w.rows.get('wp1')!.sourceItemKey).toBeNull()
      expect([...w.rows.values()].filter(x => x.sourceItemKey)).toEqual([])
    })

    it('still detects a real edit made after the latest run', async () => {
      const { w, deps } = await partialThenComplete()
      w.edit(w.unit('L3#1')!.id)
      const r = await runRollback(deps, w.allSnapshots(), { apply: true })
      expect(r.refused[0].reason).toContain('unit')
      expect(w.deleted).toEqual([])
    })
  })
})
