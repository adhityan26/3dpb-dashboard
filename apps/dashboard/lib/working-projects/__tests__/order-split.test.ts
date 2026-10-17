import { describe, it, expect } from 'vitest'
import { planOrderSplit, pickLegacyWp, SPLITTABLE_STATUSES, type SplitWp } from '../order-split'
import type { OrderLine } from '../order-units'

const P1 = 'Green Lantern Ring 2026 3D Print'
const P2 = '3D Print Green Lantern Ring Cosplay'
const ORDER = '586311573917172770'

const line = (key: string, productName: string, variantName: string | null, qty = 1): OrderLine =>
  ({ key, productName, variantName, qty, unitPrice: 100000, productId: `p-${key}` })

function wp(over: Partial<SplitWp> = {}): SplitWp {
  return {
    id: 'wp1', product: `${P1} (7), ${P1} (13)`, variant: null, notes: null, status: 'Open', checklist: [],
    sourceItemKey: null, orderId: ORDER, discordThreadId: 't1', forumChannelId: 'forum-cincin', ...over,
  }
}
const twoSizes = [line('L1', P1, '7'), line('L2', P1, '13')]
const sameForum = () => 'forum-cincin'

function okPlan(w: SplitWp, lines: OrderLine[], forum = sameForum) {
  const plan = planOrderSplit(w, lines, forum)
  if (!plan.ok) throw new Error(`expected ok, got ${plan.reason}`)
  return plan.assignments
}
function reason(w: SplitWp, lines: OrderLine[], forum = sameForum) {
  const plan = planOrderSplit(w, lines, forum)
  return plan.ok ? 'ok' : plan.reason
}

describe('planOrderSplit - basic shape', () => {
  it('(a) splits real order 586311573917172770 (size 7 + 13) into 2 units, reusing unit 1', () => {
    const a = okPlan(wp(), twoSizes)
    expect(a).toHaveLength(2)
    expect(a.map(x => x.reuse)).toEqual([true, false])
    expect(a.map(x => x.unit.itemKey)).toEqual(['L1#1', 'L2#1'])
    expect(a.map(x => [x.product, x.variant])).toEqual([[P1, '7'], [P1, '13']])
    expect(a.every(x => x.notes === null && x.checklist.length === 0)).toBe(true)
  })

  it('(b) splits one line with qty 2 (variant 8) into 2 units', () => {
    const w = wp({ product: P1, variant: '8' })
    const a = okPlan(w, [line('L1', P1, '8', 2)])
    expect(a.map(x => x.unit.itemKey)).toEqual(['L1#1', 'L1#2'])
    expect(a.map(x => x.reuse)).toEqual([true, false])
    expect(a.every(x => x.variant === '8')).toBe(true)
  })
})

describe('planOrderSplit - notes', () => {
  const lines = [line('L1', P1, '7'), line('L2', P2, '9')]
  const product = `${P1} (7), ${P2} (9)`

  it('(c) maps " / " separated notes to each unit', () => {
    const notes = `${P1}|size US 7|catatan A / ${P2}|size US 9|catatan B`
    const a = okPlan(wp({ product, notes }), lines)
    expect(a[0].notes).toBe(`${P1}|size US 7|catatan A`)
    expect(a[1].notes).toBe(`${P2}|size US 9|catatan B`)
  })

  it('(d) maps flat "|" notes regardless of order', () => {
    const notes = `${P2}|catatan B|size US 9|${P1}|catatan A|size US 7`
    const a = okPlan(wp({ product, notes }), lines)
    expect(a[0].notes).toBe(`${P1}|catatan A|size US 7`)
    expect(a[1].notes).toBe(`${P2}|catatan B|size US 9`)
  })

  it('(e) falls back to the variantShort key ("GL Ring ...")', () => {
    const notes = 'GL Ring 2026 3D Print (7)|size US 7 / 3D Print GL Ring Cosplay (9)|size US 9'
    const a = okPlan(wp({ product, notes }), lines)
    expect(a[0].notes).toBe('GL Ring 2026 3D Print (7)|size US 7')
    expect(a[1].notes).toBe('3D Print GL Ring Cosplay (9)|size US 9')
  })

  it('(f) does not mix up substring sizes 7 vs 17 (either block order)', () => {
    const l = [line('L1', P1, '7'), line('L2', P1, '17')]
    const prod = `${P1} (7), ${P1} (17)`
    const n1 = `${P1} (7)|size US 7|note a / ${P1} (17)|size US 17|note b`
    const a1 = okPlan(wp({ product: prod, notes: n1 }), l)
    expect(a1[0].notes).toBe(`${P1} (7)|size US 7|note a`)
    expect(a1[1].notes).toBe(`${P1} (17)|size US 17|note b`)
    const n2 = `${P1} (17)|size US 17|note b / ${P1} (7)|size US 7|note a`
    const a2 = okPlan(wp({ product: prod, notes: n2 }), l)
    expect(a2[0].notes).toBe(`${P1} (7)|size US 7|note a`)
    expect(a2[1].notes).toBe(`${P1} (17)|size US 17|note b`)
  })

  it('(f2) a bare short field "7" that also substring-matches key "(17)" is rejected, not guessed', () => {
    const l = [line('L1', P1, '7'), line('L2', P1, '17')]
    const notes = '7|size US 7 / 17|size US 17'
    expect(reason(wp({ product: `${P1} (7), ${P1} (17)`, notes }), l)).toBe('notes-unmappable')
  })

  it('(g) generic unsegmented notes on 2 lines -> notes-unmappable', () => {
    expect(reason(wp({ product, notes: 'tolong cepat ya' }), lines)).toBe('notes-unmappable')
  })

  it('(h) appended timestamp lines -> notes-residual with the residue as detail', () => {
    const notes = `${P1}|size US 7 / ${P2}|size US 9\n[2026-10-01 10:00] ganti ukuran`
    const plan = planOrderSplit(wp({ product, notes }), lines, sameForum)
    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.reason).toBe('notes-residual')
      expect(plan.detail).toContain('ganti ukuran')
    }
  })

  it('(h2) leftover free text outside any segment -> notes-residual', () => {
    const notes = `${P1}|size US 7 / ${P2}|size US 9 / hadiah stiker`
    expect(reason(wp({ product, notes }), lines)).toBe('notes-residual')
  })

  it('(i) qty 2 with two distinct sizes in notes -> notes-multi-size', () => {
    expect(reason(wp({ product: P1, variant: '8', notes: 'awalnya US 7 ganti US 9' }), [line('L1', P1, '8', 2)])).toBe('notes-multi-size')
  })

  it.each([
    'ukuran 7 dan 8', 'US 7 & 9', 'size 7, 8', 'us 7/8', 'size: 7 atau 8', 'ukuran 7 - 8', 'us 7.5 dan 8', 'size 7, 8 dan 9',
  ])('(i3) qty 2 with several sizes in ONE phrase (%s) -> notes-multi-size', (notes) => {
    expect(reason(wp({ product: P1, variant: '8', notes }), [line('L1', P1, '8', 2)])).toBe('notes-multi-size')
  })

  it('(i4) the same size repeated in one phrase or across phrases is still single-size', () => {
    expect(reason(wp({ product: P1, variant: '8', notes: 'size 8 dan 8, us 8' }), [line('L1', P1, '8', 2)])).toBe('ok')
  })

  it('(i2) qty 2 with a single size copies notes verbatim to both units', () => {
    const a = okPlan(wp({ product: P1, variant: '8', notes: 'size US 8 box hitam' }), [line('L1', P1, '8', 2)])
    expect(a.map(x => x.notes)).toEqual(['size US 8 box hitam', 'size US 8 box hitam'])
  })
})

describe('planOrderSplit - checklist', () => {
  const lab = (n: string, step: string) => `GL Ring 2026 3D Print (${n}) — ${step}`

  it('(j) prefixed undone items stay only with their own unit, prefix stripped', () => {
    const a = okPlan(wp({ checklist: [
      { text: lab('7', 'Print Frame'), done: false },
      { text: lab('13', 'Cat Ring'), done: false },
    ] }), twoSizes)
    expect(a[0].checklist).toEqual([{ text: 'Print Frame', done: false }])
    expect(a[1].checklist).toEqual([{ text: 'Cat Ring', done: false }])
  })

  it('(k) a done item without a prefix -> checklist-unmappable', () => {
    expect(reason(wp({ checklist: [{ text: 'Print Frame', done: true }] }), twoSizes)).toBe('checklist-unmappable')
  })

  it('(k2) an undone unprefixed item is copied to every unit; deleted items are ignored', () => {
    const a = okPlan(wp({ checklist: [
      { text: 'Packing', done: false },
      { text: 'Lama', done: true, deleted: true },
    ] }), twoSizes)
    expect(a[0].checklist).toEqual([{ text: 'Packing', done: false }])
    expect(a[1].checklist).toEqual([{ text: 'Packing', done: false }])
  })

  it('(l) a done prefixed item follows its owner with done: true', () => {
    const a = okPlan(wp({ checklist: [{ text: lab('13', 'Print Ring'), done: true }] }), twoSizes)
    expect(a[0].checklist).toEqual([])
    expect(a[1].checklist).toEqual([{ text: 'Print Ring', done: true }])
  })

  it('(m) an unknown prefix -> checklist-unmappable', () => {
    expect(reason(wp({ checklist: [{ text: 'GL Ring Lain (5) — Print Frame', done: false }] }), twoSizes)).toBe('checklist-unmappable')
  })

  it('(m2) prefix matching is exact: "(1)" does not claim "(13)"', () => {
    expect(reason(wp({ checklist: [{ text: lab('1', 'Print Frame'), done: false }] }), twoSizes)).toBe('checklist-unmappable')
  })

  it('qty 2 line: extra unit gets an undone copy of a prefixed item', () => {
    const w = wp({ product: P1, variant: '8', checklist: [{ text: 'GL Ring 2026 3D Print — Print Frame', done: true }] })
    const a = okPlan(w, [line('L1', P1, '8', 2)])
    expect(a[0].checklist).toEqual([{ text: 'Print Frame', done: true }])
    expect(a[1].checklist).toEqual([{ text: 'Print Frame', done: false }])
  })

  it('qty 2 line with a done unprefixed item -> checklist-unmappable', () => {
    expect(reason(wp({ product: P1, variant: '8', checklist: [{ text: 'Print Frame', done: true }] }), [line('L1', P1, '8', 2)])).toBe('checklist-unmappable')
  })
})

describe('planOrderSplit - rejections', () => {
  it('(n) not-active / already-split / no-thread / no-order', () => {
    expect(reason(wp({ status: 'Done' }), twoSizes)).toBe('not-active')
    expect(reason(wp({ status: 'Canceled' }), twoSizes)).toBe('not-active')
    expect(reason(wp({ sourceItemKey: 'L1#1' }), twoSizes)).toBe('already-split')
    expect(reason(wp({ discordThreadId: null }), twoSizes)).toBe('no-thread')
    expect(reason(wp({ orderId: null }), twoSizes)).toBe('no-order')
    expect(reason(wp(), [])).toBe('no-order')
  })

  it('every splittable status is accepted', () => {
    for (const s of SPLITTABLE_STATUSES) expect(reason(wp({ status: s }), twoSizes)).toBe('ok')
    expect([...SPLITTABLE_STATUSES].sort()).toEqual(['Open', 'Proses', 'Siap Kirim', 'Waiting Customer'])
  })

  it('(n) single-unit', () => {
    expect(reason(wp({ product: P1, variant: '7' }), [line('L1', P1, '7')])).toBe('single-unit')
  })

  it('(n) cross-category when units route to different forums', () => {
    const lines = [line('L1', P1, '7'), line('L2', P2, '9')]
    const forum = (u: { productName: string }) => (u.productName === P1 ? 'forum-cincin' : 'forum-topeng')
    expect(reason(wp({ product: `${P1} (7), ${P2} (9)` }), lines, forum as never)).toBe('cross-category')
  })

  it('(n) entry-count when product entries differ from line count', () => {
    expect(reason(wp({ product: P1 }), twoSizes)).toBe('entry-count')
  })

  it('entry-mismatch when an entry text differs from the order line (case-insensitive otherwise)', () => {
    expect(reason(wp({ product: `${P1} (7), ${P1} (14)` }), twoSizes)).toBe('entry-mismatch')
    expect(reason(wp({ product: `${P1.toUpperCase()} (7),  ${P1} (13) ` }), twoSizes)).toBe('ok')
  })

  it('entry-mismatch for a single line with a separate variant whose entry is not the bare name', () => {
    expect(reason(wp({ product: `${P1} (8)`, variant: '8' }), [line('L1', P1, '8', 2)])).toBe('entry-mismatch')
  })

  it('a line without a variant uses the bare name as its entry', () => {
    const lines = [line('L1', P1, null), line('L2', P2, '9')]
    expect(reason(wp({ product: `${P1}, ${P2} (9)` }), lines)).toBe('ok')
  })
})

describe('pickLegacyWp', () => {
  it('(o) 2 WPs -> duplicate-legacy; 1 -> ok; none -> empty', () => {
    expect(pickLegacyWp([{ id: 'a', discordThreadId: 't' }, { id: 'b', discordThreadId: null }])).toEqual({ ok: false, reason: 'duplicate-legacy' })
    expect(pickLegacyWp([{ id: 'a', discordThreadId: 't' }])).toEqual({ ok: true, wp: { id: 'a', discordThreadId: 't' } })
    expect(pickLegacyWp([])).toEqual({ ok: false, reason: 'empty' })
  })
})
