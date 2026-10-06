import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
const update = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { marketplaceOrder: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) } } }))
const getEscrowDetailBatch = vi.fn()
vi.mock('@/lib/shopee/escrow', () => ({ getEscrowDetailBatch: (...a: unknown[]) => getEscrowDetailBatch(...a) }))
const listStatementOrders = vi.fn()
vi.mock('@/lib/tokopedia/finance', () => ({ listStatementOrders: (...a: unknown[]) => listStatementOrders(...a) }))

import { syncWorkingProjectIncome } from '../income-sync'
import { TokopediaError } from '@/lib/tokopedia/types'

const m = (amount: string) => ({ amount })
const rec = (id: string, status = 1) => ({
  reference_id: id, earning_amount: m('150000'), fees: m('-26945'), settlement_amount: m('123055'), settlement_status: status,
})

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }) })

describe('syncWorkingProjectIncome', () => {
  it('does nothing — and calls no marketplace — when no order needs income', async () => {
    findMany.mockResolvedValue([])
    const r = await syncWorkingProjectIncome()
    expect(r.scanned).toBe(0)
    expect(getEscrowDetailBatch).not.toHaveBeenCalled()
    expect(listStatementOrders).not.toHaveBeenCalled()
  })

  it('stores Shopee escrow as settled income', async () => {
    findMany.mockResolvedValue([{ id: 'a', source: 'shopee', sourceOrderNo: 'SN1' }])
    getEscrowDetailBatch.mockResolvedValue(new Map([['SN1', { order_selling_price: 90000, escrow_amount: 69752 }]]))
    const r = await syncWorkingProjectIncome()
    expect(r.updated).toBe(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: expect.objectContaining({ salePrice: 90000, feesTotal: 20248, netIncome: 69752, incomeStatus: 'settled', incomeSyncedAt: expect.any(Date) }),
    })
  })

  it('marks a Shopee order without escrow as checked but leaves income empty', async () => {
    findMany.mockResolvedValue([{ id: 'a', source: 'shopee', sourceOrderNo: 'SN1' }])
    getEscrowDetailBatch.mockResolvedValue(new Map())
    const r = await syncWorkingProjectIncome()
    expect(r.notFound).toBe(1)
    expect(update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { incomeSyncedAt: expect.any(Date) } })
  })

  it('stores Tokopedia settlement rows and stops paging once every target is found', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: '111' }])
    listStatementOrders.mockResolvedValue({ orders: [rec('999'), rec('111', 2)], total: 500 })
    const r = await syncWorkingProjectIncome()
    expect(listStatementOrders).toHaveBeenCalledTimes(1)
    expect(r.updated).toBe(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ salePrice: 150000, feesTotal: 26945, netIncome: 123055, incomeStatus: 'settled' }),
    })
  })

  it('on a session/verification error it stops and does not mark the remaining orders as checked', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: '111' }])
    listStatementOrders.mockRejectedValue(new TokopediaError('VERIFICATION_REQUIRED', 'captcha'))
    const r = await syncWorkingProjectIncome()
    expect(update).not.toHaveBeenCalled()
    expect(r.errors[0]).toContain('VERIFICATION_REQUIRED')
  })

  it('remembers Tokopedia orders missing from the settlement list so they are not re-walked every tick', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: '111' }])
    listStatementOrders.mockResolvedValue({ orders: [rec('999')], total: 1 })
    const r = await syncWorkingProjectIncome()
    expect(r.notFound).toBe(1)
    expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { incomeStatus: 'unavailable', incomeSyncedAt: expect.any(Date) } })
  })

  it('stores the release time of a settled Tokopedia order', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: '111' }])
    listStatementOrders.mockResolvedValue({ orders: [{ ...rec('111', 2), settlement_time: '1784769070000' }], total: 1 })
    await syncWorkingProjectIncome({ tokopediaPageGapMs: 0 })
    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ incomeStatus: 'settled', incomeSettledAt: new Date(1784769070000) }),
    })
  })

  it('stops at the page cap and marks what it never found as unavailable instead of re-walking', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: 'never' }])
    listStatementOrders.mockImplementation(async () => ({ orders: Array.from({ length: 100 }, (_, i) => rec(`x${i}`)), total: 100000 }))
    const r = await syncWorkingProjectIncome({ tokopediaPageGapMs: 0 })
    expect(listStatementOrders).toHaveBeenCalledTimes(40)
    expect(r.notFound).toBe(1)
    expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { incomeStatus: 'unavailable', incomeSyncedAt: expect.any(Date) } })
  })

  it('on a non-fatal Tokopedia error counts the orders as failed and saves nothing', async () => {
    findMany.mockResolvedValue([{ id: 't1', source: 'tokopedia', sourceOrderNo: '111' }, { id: 't2', source: 'tokopedia', sourceOrderNo: '222' }])
    listStatementOrders.mockRejectedValue(new Error('HTTP 500'))
    const r = await syncWorkingProjectIncome({ tokopediaPageGapMs: 0 })
    expect(r.failed).toBe(2)
    expect(update).not.toHaveBeenCalled()
  })

  it('only picks orders with a Done WP that are unfilled, stale estimates, or long-stale unavailable ones', async () => {
    findMany.mockResolvedValue([])
    const now = new Date('2026-10-07T00:00:00Z')
    await syncWorkingProjectIncome({ now })
    const where = findMany.mock.calls[0][0].where
    expect(where.projects).toEqual({ some: { status: 'Done' } })
    expect(where.source).toEqual({ in: ['shopee', 'tokopedia'] })
    expect(where.OR).toHaveLength(3)
    expect(where.OR[0]).toMatchObject({ incomeStatus: null })
    expect(where.OR[1]).toMatchObject({ incomeStatus: 'estimated' })
    expect(where.OR[2]).toEqual({ incomeStatus: 'unavailable', incomeSyncedAt: { lt: new Date('2026-10-04T00:00:00Z') } })
  })
})
