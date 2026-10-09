import { describe, it, expect } from 'vitest'
import { planOrderBackfill, type BackfillWp } from '../order-backfill'

const wp = (o: Partial<BackfillWp> & { id: string }): BackfillWp => ({
  source: 'shopee', sourceOrderNo: 'SN1', orderId: null, quotationId: null, ...o,
})

describe('planOrderBackfill', () => {
  it('creates one order and links both WPs of the same order', () => {
    const plan = planOrderBackfill([wp({ id: 'a' }), wp({ id: 'b' })], [])
    expect(plan.newOrders).toEqual([{ source: 'shopee', sourceOrderNo: 'SN1', quotationId: null }])
    expect(plan.links.map((l) => l.wpId)).toEqual(['a', 'b'])
  })

  it('skips manual WPs and WPs without an order number', () => {
    const plan = planOrderBackfill(
      [wp({ id: 'm', source: 'manual' }), wp({ id: 'n', sourceOrderNo: null })], [])
    expect(plan.skipped).toBe(2)
    expect(plan.newOrders).toEqual([])
    expect(plan.links).toEqual([])
  })

  it('skips WPs that already have an orderId', () => {
    const plan = planOrderBackfill([wp({ id: 'a', orderId: 'o1' })], [])
    expect(plan.skipped).toBe(1)
    expect(plan.links).toEqual([])
    expect(plan.newOrders).toEqual([])
  })

  it('takes the single non-null quotationId of the group', () => {
    const plan = planOrderBackfill([wp({ id: 'a', quotationId: 'q1' }), wp({ id: 'b' })], [])
    expect(plan.newOrders[0].quotationId).toBe('q1')
  })

  it('reports differing quotationIds as a conflict and creates the order with null', () => {
    const plan = planOrderBackfill(
      [wp({ id: 'a', quotationId: 'q1' }), wp({ id: 'b', quotationId: 'q2' })], [])
    expect(plan.quotationConflicts).toEqual([{ source: 'shopee', sourceOrderNo: 'SN1', quotationIds: ['q1', 'q2'] }])
    expect(plan.newOrders[0].quotationId).toBeNull()
  })

  it('fills the quotationId of an existing order that lacks one', () => {
    const plan = planOrderBackfill(
      [wp({ id: 'a', quotationId: 'q1' })],
      [{ source: 'shopee', sourceOrderNo: 'SN1', quotationId: null }])
    expect(plan.newOrders).toEqual([])
    expect(plan.quotationUpdates).toEqual([{ source: 'shopee', sourceOrderNo: 'SN1', quotationId: 'q1' }])
    expect(plan.links).toHaveLength(1)
  })

  it('is idempotent: the plan for the resulting state is empty', () => {
    const wps = [wp({ id: 'a', quotationId: 'q1' }), wp({ id: 'b' })]
    const first = planOrderBackfill(wps, [])
    const after = wps.map((w) => ({ ...w, orderId: 'o1' }))
    const existing = first.newOrders.map((o) => ({ ...o }))
    const second = planOrderBackfill(after, existing)
    expect(second.newOrders).toEqual([])
    expect(second.links).toEqual([])
    expect(second.quotationUpdates).toEqual([])
    expect(second.quotationConflicts).toEqual([])
  })
})
