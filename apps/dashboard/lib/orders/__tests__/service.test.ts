import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: { labelStatus: { findMany: vi.fn().mockResolvedValue([]) } },
}))
vi.mock('@/lib/shopee/orders', () => ({
  getOrderList: vi.fn(),
  getOrderDetail: vi.fn(),
}))

import { getReadyToShipOrders, countBelumCetak, getOrdersInRange } from '../service'
import { getOrderList, getOrderDetail } from '@/lib/shopee/orders'

const emptyPage = { order_list: [], more: false, next_cursor: '' }

beforeEach(() => {
  vi.clearAllMocks()
  ;(getOrderList as any).mockResolvedValue(emptyPage)
  ;(getOrderDetail as any).mockResolvedValue([])
})

describe('getReadyToShipOrders', () => {
  it('queries a lookback window wider than 15 days, so orders stuck unshipped for longer are not silently dropped', async () => {
    await getReadyToShipOrders()

    const calls = (getOrderList as any).mock.calls as [{ timeFrom: number; timeTo: number; status: string }][]
    expect(calls.length).toBeGreaterThan(0)
    const earliestTimeFrom = Math.min(...calls.map(c => c[0].timeFrom))
    const latestTimeTo = Math.max(...calls.map(c => c[0].timeTo))
    const spanDays = (latestTimeTo - earliestTimeFrom) / 86400
    expect(spanDays).toBeGreaterThan(15)
  })

  it('chunks the lookback window into <=15-day calls for each unshipped status', async () => {
    await getReadyToShipOrders()

    const calls = (getOrderList as any).mock.calls as [{ timeFrom: number; timeTo: number; status: string }][]
    for (const [call] of calls) {
      const windowDays = (call.timeTo - call.timeFrom) / 86400
      expect(windowDays).toBeLessThanOrEqual(15)
    }
    const statuses = new Set(calls.map(c => c[0].status))
    expect(statuses).toEqual(new Set(['READY_TO_SHIP', 'PROCESSED']))
  })
})

describe('countBelumCetak', () => {
  it('also queries a lookback window wider than 15 days', async () => {
    await countBelumCetak()

    const calls = (getOrderList as any).mock.calls as [{ timeFrom: number; timeTo: number; status: string }][]
    expect(calls.length).toBeGreaterThan(0)
    const earliestTimeFrom = Math.min(...calls.map(c => c[0].timeFrom))
    const latestTimeTo = Math.max(...calls.map(c => c[0].timeTo))
    expect((latestTimeTo - earliestTimeFrom) / 86400).toBeGreaterThan(15)
    for (const [call] of calls) expect(call.status).toBe('READY_TO_SHIP')
  })
})

describe('getOrdersInRange', () => {
  it('still chunks an arbitrary caller-supplied range into <=15-day windows', async () => {
    const now = Math.floor(Date.now() / 1000)
    const from = now - 40 * 86400
    await getOrdersInRange({ timeFrom: from, timeTo: now, status: 'READY_TO_SHIP' })

    const calls = (getOrderList as any).mock.calls as [{ timeFrom: number; timeTo: number }][]
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const [call] of calls) {
      expect((call.timeTo - call.timeFrom) / 86400).toBeLessThanOrEqual(15)
    }
  })
})
