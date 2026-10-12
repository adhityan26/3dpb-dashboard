import { describe, it, expect, vi } from 'vitest'
import {
  runSplit, runRollback, type SplitDeps, type CandidateWp, type SplitSnapshot, type UnitCreateResult, type FetchedOrder,
} from '../order-split-runner'
import type { OrderLine } from '../order-units'

const P1 = 'Green Lantern Ring 2026 3D Print'
const ORDER = '586311573917172770'
const FORUM = 'forum-cincin'
const T0 = '2026-10-10T00:00:00.000Z'

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
    sourceProductId: null, itemPrice: null, ...over,
  }
}

interface Calls { ops: string[] }
function makeDeps(over: Partial<SplitDeps> & { rows?: CandidateWp[]; lines?: Record<string, OrderLine[]>; keyed?: Record<string, string[]> } = {}) {
  const calls: Calls = { ops: [] }
  const rows = over.rows ?? [wp()]
  const live = new Map<string, CandidateWp>(rows.map(r => [r.id, structuredClone(r)]))
  const lines = over.lines ?? { [`shopee:${ORDER}`]: twoSizes }
  let seq = 0
  const snapshots: SplitSnapshot[] = []
  const deps: SplitDeps = {
    loadCandidates: async () => ({ legacy: rows, keyedByOrder: new Map(Object.entries(over.keyed ?? {})) }),
    fetchLines: async (orders) => {
      calls.ops.push('fetch')
      const m = new Map<string, FetchedOrder>()
      for (const o of orders) { const l = lines[`${o.source}:${o.sourceOrderNo}`]; if (l) m.set(`${o.source}:${o.sourceOrderNo}`, { lines: l }) }
      return m
    },
    forumForUnit: () => FORUM,
    loadWp: async (id) => live.get(id) ?? null,
    createUnit: async (input): Promise<UnitCreateResult> => {
      calls.ops.push(`create:${input.sourceItemKey}`)
      const id = `new${++seq}`
      return { id, threadId: `th${seq}`, syncState: 'ok', skipped: false }
    },
    convertLegacy: async (a) => { calls.ops.push('convert'); return a.expectedUpdatedAt === live.get(a.id)?.updatedAt ? 1 : 0 },
    resync: async (id) => { calls.ops.push(`resync:${id}`); return { discordSynced: true } },
    writeSnapshot: async (s) => { calls.ops.push('snapshot'); snapshots.push(structuredClone(s)); return '/snap/split.json' },
    deleteUnit: async (id) => { calls.ops.push(`delete:${id}`) },
    restoreLegacy: async (w) => { calls.ops.push(`restore:${w.id}`) },
    now: () => new Date('2026-10-14T00:00:00.000Z'),
    sleep: async (ms) => { calls.ops.push(`sleep:${ms}`) },
    log: () => {},
    ...over,
  }
  return { deps, calls, live, snapshots }
}

describe('runSplit - dry run', () => {
  it('writes nothing and reports plannable orders, budget and thread count', async () => {
    const { deps, calls } = makeDeps()
    const { report, applied } = await runSplit(deps, {})
    expect(applied).toBeUndefined()
    expect(calls.ops).toEqual(['fetch'])
    expect(report.plannable).toEqual([{ key: `shopee:${ORDER}`, units: 2, newThreads: 1 }])
    expect(report.totalNewThreads).toBe(1)
    expect(report.budget.shopeeBatches).toBe(1)
  })

  it('reports skip reasons with examples (order no, notes excerpt, checklist labels)', async () => {
    const w = wp({ notes: 'catatan umum tanpa pemisah', checklist: [{ text: 'Print', done: true }] })
    const { deps } = makeDeps({ rows: [w] })
    const { report } = await runSplit(deps, {})
    expect(report.plannable).toEqual([])
    const s = report.skips['notes-unmappable'] ?? report.skips['checklist-unmappable']
    expect(s.count).toBe(1)
    expect(s.examples[0].order).toBe(ORDER)
    expect(s.examples[0].notes).toContain('catatan umum')
    expect(s.examples[0].checklist).toEqual(['[x] Print'])
  })

  it('skips the whole order on duplicate-legacy', async () => {
    const { deps } = makeDeps({ rows: [wp(), wp({ id: 'wp2' })] })
    const { report } = await runSplit(deps, {})
    expect(report.skips['duplicate-legacy'].count).toBe(1)
    expect(report.plannable).toEqual([])
  })

  it('skips the order as mixed-order when an unrelated keyed WP exists', async () => {
    const { deps } = makeDeps({ keyed: { [`shopee:${ORDER}`]: ['ZZZ#1'] } })
    const { report } = await runSplit(deps, {})
    expect(report.skips['mixed-order'].count).toBe(1)
  })

  it('reports not-in-tabs for a Tokopedia order the marketplace no longer lists', async () => {
    const { deps } = makeDeps({ rows: [wp({ source: 'tokopedia' })], lines: {} })
    const { report } = await runSplit(deps, {})
    expect(report.skips['not-in-tabs'].count).toBe(1)
  })
})

describe('runSplit - apply', () => {
  it('snapshots first, creates extras, converts the legacy WP last', async () => {
    const { deps, calls, snapshots } = makeDeps()
    const { applied } = await runSplit(deps, { apply: true })
    const ops = calls.ops
    expect(ops.indexOf('snapshot')).toBeLessThan(ops.findIndex(o => o.startsWith('create:')))
    expect(ops.findIndex(o => o.startsWith('create:'))).toBeLessThan(ops.indexOf('convert'))
    expect(ops.indexOf('convert')).toBeLessThan(ops.indexOf('resync:wp1'))
    expect(applied!.converted).toEqual([`shopee:${ORDER}`])
    const last = snapshots[snapshots.length - 1].entries[0]
    expect(last.created).toEqual([{ id: 'new1', threadId: 'th1', itemKey: 'L2#1' }])
    expect(last.converted).toBe(true)
  })

  it('passes inherited state to the new unit without pinging', async () => {
    const seen: unknown[] = []
    const { deps } = makeDeps({ createUnit: async (i) => { seen.push(i); return { id: 'n', threadId: 't', syncState: 'ok', skipped: false } } })
    await runSplit(deps, { apply: true })
    expect(seen[0]).toMatchObject({
      sourceItemKey: 'L2#1', variant: '13', itemPrice: 100000, forumChannelId: FORUM, dueDateRaw: '2026-10-20T00:00:00.000Z',
      initial: { status: 'Proses', payment: 'Lunas', remindersSent: [3], appliedTags: ['tag1'], trackingNo: 'JP123', mentionsInPost: false },
      mentions: ['u1'],
    })
  })

  it('does not convert when an extra returns syncState error without throwing', async () => {
    const { deps, calls } = makeDeps({ createUnit: async () => ({ id: 'n1', threadId: null, syncState: 'error', skipped: false }) })
    const { applied } = await runSplit(deps, { apply: true })
    expect(calls.ops).not.toContain('convert')
    expect(applied!.converted).toEqual([])
    expect(applied!.incomplete[0].key).toBe(`shopee:${ORDER}`)
  })

  it('does not convert when an extra is pending with no thread', async () => {
    const { deps, calls } = makeDeps({ createUnit: async () => ({ id: 'n1', threadId: null, syncState: 'pending', skipped: true }) })
    await runSplit(deps, { apply: true })
    expect(calls.ops).not.toContain('convert')
  })

  it('records only skipped:false results in created, but counts an existing threaded unit as success', async () => {
    const { deps, calls, snapshots } = makeDeps({ createUnit: async () => ({ id: 'old', threadId: 'th-old', syncState: 'ok', skipped: true }) })
    const { applied } = await runSplit(deps, { apply: true })
    expect(calls.ops).toContain('convert')
    expect(applied!.converted).toHaveLength(1)
    expect(snapshots[snapshots.length - 1].entries[0].created).toEqual([])
  })

  it('records a created row whose thread failed so rollback can remove it', async () => {
    const { deps, snapshots } = makeDeps({ createUnit: async () => ({ id: 'n1', threadId: null, syncState: 'error', skipped: false }) })
    await runSplit(deps, { apply: true })
    expect(snapshots[snapshots.length - 1].entries[0].created).toEqual([{ id: 'n1', threadId: null, itemKey: 'L2#1' }])
  })

  it('stops after 3 consecutive Discord failures', async () => {
    const rows = [1, 2, 3, 4, 5].map(i => wp({ id: `w${i}`, sourceOrderNo: `O${i}`, orderId: `o${i}` }))
    const lines = Object.fromEntries(rows.map(r => [`shopee:${r.sourceOrderNo}`, twoSizes]))
    const create = vi.fn(async () => ({ id: 'n', threadId: null, syncState: 'error', skipped: false }))
    const { deps } = makeDeps({ rows, lines, createUnit: create })
    const { applied } = await runSplit(deps, { apply: true })
    expect(create).toHaveBeenCalledTimes(3)
    expect(applied!.aborted).toBe(true)
  })

  it('a thrown createUnit counts as a failure and does not convert', async () => {
    const { deps, calls } = makeDeps({ createUnit: async () => { throw new Error('relay down') } })
    const { applied } = await runSplit(deps, { apply: true })
    expect(calls.ops).not.toContain('convert')
    expect(applied!.incomplete[0].reason).toContain('relay down')
  })

  it('reports changed-since-snapshot when the live row differs, without writing', async () => {
    const { deps, calls, live } = makeDeps()
    live.get('wp1')!.updatedAt = '2026-10-13T00:00:00.000Z'
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.changedSinceSnapshot).toEqual([`shopee:${ORDER}`])
    expect(calls.ops.some(o => o.startsWith('create:') || o === 'convert')).toBe(false)
  })

  it('reports changed-since-snapshot (no force) when the conditional convert affects != 1 row', async () => {
    const { deps, calls } = makeDeps({ convertLegacy: async () => 0 })
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.changedSinceSnapshot).toEqual([`shopee:${ORDER}`])
    expect(applied!.converted).toEqual([])
    expect(calls.ops.some(o => o.startsWith('resync'))).toBe(false)
  })

  it('a resync failure after conversion is listed, not fatal', async () => {
    const { deps } = makeDeps({ resync: async () => { throw new Error('x') } })
    const { applied } = await runSplit(deps, { apply: true })
    expect(applied!.converted).toHaveLength(1)
    expect(applied!.needsResync).toEqual([`shopee:${ORDER}`])
  })

  it('re-run after a partial failure only creates the missing unit', async () => {
    // 3 units: first run fails on the 2nd extra (L3), 1st extra (L2) was created.
    const rows = [wp({ product: `${P1} (7), ${P1} (13), ${P1} (9)` })]
    const lines = { [`shopee:${ORDER}`]: threeSizes }
    const existing = new Map<string, { id: string; threadId: string }>()
    const createFor = (failKey?: string) => async (i: { sourceItemKey: string }): Promise<UnitCreateResult> => {
      const have = existing.get(i.sourceItemKey)
      if (have) return { id: have.id, threadId: have.threadId, syncState: 'ok', skipped: true }
      if (i.sourceItemKey === failKey) return { id: 'bad', threadId: null, syncState: 'error', skipped: false }
      const r = { id: `id-${i.sourceItemKey}`, threadId: `th-${i.sourceItemKey}` }
      existing.set(i.sourceItemKey, r)
      return { ...r, syncState: 'ok', skipped: false }
    }
    const first = makeDeps({ rows, lines, createUnit: createFor('L3#1') })
    await runSplit(first.deps, { apply: true })
    expect([...existing.keys()]).toEqual(['L2#1'])
    // Second run: L2 exists keyed already (allowed leftover), legacy still unconverted.
    const second = makeDeps({ rows, lines, keyed: { [`shopee:${ORDER}`]: ['L2#1'] }, createUnit: createFor() })
    const { applied } = await runSplit(second.deps, { apply: true })
    expect([...existing.keys()].sort()).toEqual(['L2#1', 'L3#1'])
    expect(applied!.converted).toHaveLength(1)
    expect(second.snapshots[second.snapshots.length - 1].entries[0].created.map(c => c.itemKey)).toEqual(['L3#1'])
  })

  it('--limit processes only the first n orders and --only filters by order number', async () => {
    const rows = [1, 2, 3].map(i => wp({ id: `w${i}`, sourceOrderNo: `O${i}`, orderId: `o${i}` }))
    const lines = Object.fromEntries(rows.map(r => [`shopee:${r.sourceOrderNo}`, twoSizes]))
    const a = makeDeps({ rows, lines })
    const r1 = await runSplit(a.deps, { apply: true, limit: 2 })
    expect(r1.applied!.converted).toHaveLength(2)
    expect(r1.report.plannable).toHaveLength(3)
    const b = makeDeps({ rows, lines })
    const r2 = await runSplit(b.deps, { apply: true, only: 'O2' })
    expect(r2.applied!.converted).toEqual(['shopee:O2'])
    expect(r2.report.scanned).toBe(1)
  })
})

describe('runRollback', () => {
  const entryFor = (over: Partial<SplitSnapshot['entries'][0]> = {}): SplitSnapshot => ({
    version: 1, createdAt: '2026-10-14T00:00:00.000Z',
    entries: [{
      key: `shopee:${ORDER}`, legacy: wp(), plan: [], created: [{ id: 'new1', threadId: 'th1', itemKey: 'L2#1' }],
      converted: true, appliedAt: '2026-10-14T00:10:00.000Z', ...over,
    }],
  })
  const rows = (legacyUpdated: string, unitUpdated: string) => {
    const unit = wp({ id: 'new1', sourceItemKey: 'L2#1', discordThreadId: 'th1', updatedAt: unitUpdated })
    const legacy = wp({ sourceItemKey: 'L1#1', updatedAt: legacyUpdated })
    return makeDeps({ rows: [legacy, unit] })
  }

  it('dry-run deletes nothing', async () => {
    const { deps, calls } = rows('2026-10-14T00:09:00.000Z', '2026-10-14T00:09:00.000Z')
    const r = await runRollback(deps, [entryFor()], {})
    expect(r.restored).toEqual([`shopee:${ORDER}`])
    expect(calls.ops).toEqual([])
  })

  it('apply deletes only created ids, restores legacy, resyncs, and lists what cannot be restored', async () => {
    const { deps, calls } = rows('2026-10-14T00:09:00.000Z', '2026-10-14T00:09:00.000Z')
    const r = await runRollback(deps, [entryFor()], { apply: true })
    expect(calls.ops).toEqual(['delete:new1', 'restore:wp1', 'resync:wp1'])
    expect(r.notes.length).toBeGreaterThan(0)
  })

  it('refuses an entry edited after apply unless forceEdited', async () => {
    const { deps, calls } = rows('2026-10-14T00:09:00.000Z', '2026-10-15T00:00:00.000Z')
    const r = await runRollback(deps, [entryFor()], { apply: true })
    expect(r.refused[0].reason).toContain('edited-since-apply')
    expect(calls.ops).toEqual([])
    const forced = rows('2026-10-14T00:09:00.000Z', '2026-10-15T00:00:00.000Z')
    const r2 = await runRollback(forced.deps, [entryFor()], { apply: true, forceEdited: true })
    expect(r2.restored).toEqual([`shopee:${ORDER}`])
    expect(forced.calls.ops).toContain('delete:new1')
  })

  it('does not restore an unconverted legacy row (it was never changed)', async () => {
    const { deps, calls } = rows('2026-10-10T00:00:00.000Z', '2026-10-14T00:09:00.000Z')
    await runRollback(deps, [entryFor({ converted: false })], { apply: true })
    expect(calls.ops).toEqual(['delete:new1'])
  })
})
