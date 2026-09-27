import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/orders/service', () => ({ getReadyToShipOrders: vi.fn() }))
vi.mock('@/lib/tokopedia/orders', () => ({ listOrders: vi.fn() }))
vi.mock('@/lib/tokopedia/parse', () => ({ parseOrder: vi.fn() }))
vi.mock('../service', () => ({
  createWorkingProject: vi.fn(),
  getGLRingProductIds: vi.fn(),
  getCategoryProductIds: vi.fn(),
  getAutoCreateLastRunDate: vi.fn(),
  setAutoCreateLastRunDate: vi.fn(),
}))

import { autoCreateWorkingProjectsFromNewOrders, runDailyAutoCreateIfDue } from '../auto-create'
import { getReadyToShipOrders } from '@/lib/orders/service'
import { listOrders } from '@/lib/tokopedia/orders'
import { parseOrder } from '@/lib/tokopedia/parse'
import {
  createWorkingProject,
  getGLRingProductIds,
  getCategoryProductIds,
  getAutoCreateLastRunDate,
  setAutoCreateLastRunDate,
} from '../service'

beforeEach(() => {
  vi.clearAllMocks()
  ;(getGLRingProductIds as any).mockResolvedValue([])
  ;(getCategoryProductIds as any).mockResolvedValue([])
  ;(listOrders as any).mockResolvedValue({ main_orders: [] })
  ;(getReadyToShipOrders as any).mockResolvedValue({ orders: [] })
})

describe('autoCreateWorkingProjectsFromNewOrders', () => {
  it('creates a WP per Shopee order, routed by detected category, and counts skips from the dedupe guard', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [
        { orderSn: 'SN1', buyerUsername: 'budi', items: [{ itemId: 1, productName: 'Green Lantern Ring', variantName: 'US 9' }], createTime: 1759000000, shipByDate: 1759600000 },
        { orderSn: 'SN2', buyerUsername: 'ani', items: [{ itemId: 2, productName: 'Topeng Dr Doom', variantName: null }], createTime: 1759000000, shipByDate: null },
      ],
    })
    ;(createWorkingProject as any)
      .mockResolvedValueOnce({ id: 'wp1', threadUrl: 'https://discord/1', syncState: 'ok', skipped: false })
      .mockResolvedValueOnce({ id: 'wp2', threadUrl: 'https://discord/2', syncState: 'ok', skipped: true })

    const result = await autoCreateWorkingProjectsFromNewOrders()

    expect(createWorkingProject).toHaveBeenNthCalledWith(1, expect.objectContaining({
      source: 'shopee', sourceOrderNo: 'SN1', sourceProductId: '1', forumChannelId: 'FORUM_CINCIN_ID',
      customer: 'budi', product: 'Green Lantern Ring', variant: 'US 9',
      orderDateRaw: '2025-09-27', dueDateRaw: '2025-10-04',
    }))
    expect(createWorkingProject).toHaveBeenNthCalledWith(2, expect.objectContaining({
      forumChannelId: 'FORUM_TOPENG_ID', product: 'Topeng Dr Doom', orderDateRaw: '2025-09-27', dueDateRaw: undefined,
    }))
    expect(result).toEqual({ scanned: 2, created: 1, skipped: 1, failed: 0, errors: [] })
  })

  it('routes a Tokopedia order with no category match to the general forum', async () => {
    ;(listOrders as any).mockImplementation(async (tab: string) =>
      tab === 'perlu-dikirim' ? { main_orders: [{ id: 'raw1' }] } : { main_orders: [] },
    )
    ;(parseOrder as any).mockReturnValue({
      orderId: 'TOK1', buyerNickname: 'Cici', products: [{ name: 'Gantungan Kunci', variant: 'Merah' }],
      orderDate: 1759000000, latestRtsTime: 1759600000,
    })
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp3', threadUrl: null, syncState: 'ok', skipped: false })

    const result = await autoCreateWorkingProjectsFromNewOrders()

    expect(createWorkingProject).toHaveBeenCalledWith(expect.objectContaining({
      source: 'tokopedia', sourceOrderNo: 'TOK1', forumChannelId: 'ORDERS_FORUM_CHANNEL_ID',
      customer: 'Cici', product: 'Gantungan Kunci', variant: 'Merah',
      orderDateRaw: '2025-09-27', dueDateRaw: '2025-10-04',
    }))
    expect(result.created).toBe(1)
  })

  it('keeps going and records an error when one candidate fails to create', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN1', buyerUsername: 'budi', items: [{ itemId: 1, productName: 'Cincin', variantName: null }], createTime: 1759000000, shipByDate: null }],
    })
    ;(createWorkingProject as any).mockRejectedValue(new Error('discord-relay 403'))

    const result = await autoCreateWorkingProjectsFromNewOrders()

    expect(result).toEqual({ scanned: 1, created: 0, skipped: 0, failed: 1, errors: ['shopee:SN1: discord-relay 403'] })
  })

  it('keeps going (with an error) when the Shopee fetch itself fails, still scanning Tokopedia', async () => {
    ;(getReadyToShipOrders as any).mockRejectedValue(new Error('Shopee API down'))
    ;(listOrders as any).mockImplementation(async (tab: string) =>
      tab === 'perlu-dikirim' ? { main_orders: [{ id: 'raw1' }] } : { main_orders: [] },
    )
    ;(parseOrder as any).mockReturnValue({ orderId: 'TOK1', buyerNickname: 'Cici', products: [{ name: 'Topeng', variant: null }] })
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: null, syncState: 'ok', skipped: false })

    const result = await autoCreateWorkingProjectsFromNewOrders()

    expect(result.errors).toEqual(['shopee: gagal ambil order — Shopee API down'])
    expect(result.created).toBe(1)
  })

  it("does not abort the batch when one Shopee order's createTime is missing/invalid", async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN1', buyerUsername: 'budi', items: [{ itemId: 1, productName: 'Cincin', variantName: null }], createTime: undefined, shipByDate: null }],
    })
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: null, syncState: 'ok', skipped: false })
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(result).toEqual({ scanned: 1, created: 1, skipped: 0, failed: 0, errors: [] })
    expect(createWorkingProject).toHaveBeenCalledWith(expect.objectContaining({ orderDateRaw: undefined }))
  })
})

describe('runDailyAutoCreateIfDue', () => {
  it('does nothing before the 23:00 WIB cutoff', async () => {
    const result = await runDailyAutoCreateIfDue(new Date('2026-09-28T15:00:00Z')) // 22:00 WIB
    expect(result).toBeNull()
    expect(createWorkingProject).not.toHaveBeenCalled()
  })

  it('runs once past the cutoff and records today\'s WIB date', async () => {
    ;(getAutoCreateLastRunDate as any).mockResolvedValue(null)
    const result = await runDailyAutoCreateIfDue(new Date('2026-09-28T16:30:00Z')) // 23:30 WIB, 2026-09-28
    expect(result).toEqual({ scanned: 0, created: 0, skipped: 0, failed: 0, errors: [] })
    expect(setAutoCreateLastRunDate).toHaveBeenCalledWith('2026-09-28')
  })

  it('does not run twice on the same WIB day', async () => {
    ;(getAutoCreateLastRunDate as any).mockResolvedValue('2026-09-28')
    const result = await runDailyAutoCreateIfDue(new Date('2026-09-28T16:30:00Z')) // 23:30 WIB, still 2026-09-28 — already ran today
    expect(result).toBeNull()
    expect(setAutoCreateLastRunDate).not.toHaveBeenCalled()
  })
})
