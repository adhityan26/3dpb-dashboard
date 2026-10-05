import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
const update = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) } } }))
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
  it('does nothing — and calls no marketplace — when no WP needs income', async () => {
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

  it('on a session/verification error it stops and does not mark the remaining WPs as checked', async () => {
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
    expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { incomeSyncedAt: expect.any(Date) } })
  })
})
