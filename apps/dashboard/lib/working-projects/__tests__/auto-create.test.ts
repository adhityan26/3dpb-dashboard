import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/orders/service', () => ({ getReadyToShipOrders: vi.fn() }))
vi.mock('@/lib/tokopedia/orders', () => ({ listOrders: vi.fn() }))
vi.mock('@/lib/tokopedia/parse', () => ({ parseOrder: vi.fn() }))
vi.mock('../service', () => ({
  createWorkingProjectsForOrder: vi.fn(),
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
  createWorkingProjectsForOrder,
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

const item = (over: Record<string, unknown> = {}) => ({
  lineItemId: 100, itemId: 1, modelId: 5, productName: 'Green Lantern Ring', variantName: 'US 9', qty: 1, cancelledQty: 0, unitPrice: 136500, ...over,
})
const tokoProduct = (over: Record<string, unknown> = {}) => ({
  skuId: 'S1', productId: 'tp1', name: 'Gantungan Kunci', variant: 'Merah', qty: 1, unitPrice: 20000, ...over,
})
const batch = (created: number, skipped = 0) => ({ created, skipped, results: [] })
const tokoTab = () =>
  (listOrders as any).mockImplementation(async (tab: string) =>
    tab === 'perlu-dikirim' ? { main_orders: [{ id: 'raw1' }] } : { main_orders: [] },
  )

describe('autoCreateWorkingProjectsFromNewOrders', () => {
  it('hands each Shopee order to createWorkingProjectsForOrder with its units and routes forum by category per unit', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [
        { orderSn: 'SN1', buyerUsername: 'budi', isPreOrder: true, items: [item()], createTime: 1759000000, shipByDate: 1759600000 },
        { orderSn: 'SN2', buyerUsername: 'ani', isPreOrder: true, items: [item({ lineItemId: 200, itemId: 2, productName: 'Topeng Dr Doom', variantName: null })], createTime: 1759000000, shipByDate: null },
      ],
    })
    ;(createWorkingProjectsForOrder as any).mockResolvedValueOnce(batch(1)).mockResolvedValueOnce(batch(0, 1))

    const result = await autoCreateWorkingProjectsFromNewOrders()

    const first = (createWorkingProjectsForOrder as any).mock.calls[0][0]
    expect(first).toMatchObject({ source: 'shopee', sourceOrderNo: 'SN1' })
    expect(first.units).toEqual([{ itemKey: '100#1', productName: 'Green Lantern Ring', variantName: 'US 9', unitPrice: 136500, productId: '1' }])
    expect(first.base).toMatchObject({ platform: 'Shopee', customer: 'budi', orderDateRaw: '2025-09-27', dueDateRaw: '2025-10-04' })
    expect(first.base.forumChannelIdFor(first.units[0])).toBe('FORUM_CINCIN_ID')
    const second = (createWorkingProjectsForOrder as any).mock.calls[1][0]
    expect(second.base.forumChannelIdFor(second.units[0])).toBe('FORUM_TOPENG_ID')
    expect(second.base.dueDateRaw).toBeUndefined()
    expect(result).toEqual({ scanned: 2, created: 1, skipped: 1, failed: 0, errors: [] })
  })

  it('expands a multi-line order and a qty:2 line into one unit each, and counts WPs', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{
        orderSn: 'SN9', buyerUsername: 'budi', isPreOrder: true,
        items: [item({ lineItemId: 1, variantName: 'US 6' }), item({ lineItemId: 2, variantName: 'US 7', qty: 2 })],
        createTime: 1759000000, shipByDate: null,
      }],
    })
    ;(createWorkingProjectsForOrder as any).mockResolvedValue(batch(3))

    const result = await autoCreateWorkingProjectsFromNewOrders()

    const units = (createWorkingProjectsForOrder as any).mock.calls[0][0].units
    expect(units.map((u: any) => [u.itemKey, u.variantName])).toEqual([['1#1', 'US 6'], ['2#1', 'US 7'], ['2#2', 'US 7']])
    expect(result.created).toBe(3)
  })

  it('counts an order with every unit cancelled as skipped without calling create', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN3', buyerUsername: 'budi', isPreOrder: true, items: [item({ qty: 1, cancelledQty: 1 })], createTime: 1759000000, shipByDate: null }],
    })
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 1, created: 0, skipped: 1, failed: 0, errors: [] })
  })

  it('skips a Shopee order that is not pre-order (ready-stock accessories should not get a WP, found 2026-09-29)', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN1', buyerUsername: 'budi', isPreOrder: false, items: [item()], createTime: 1759000000, shipByDate: null }],
    })
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 0, created: 0, skipped: 0, failed: 0, errors: [] })
  })

  it('skips a Tokopedia order that is not pre-order', async () => {
    tokoTab()
    ;(parseOrder as any).mockReturnValue({ orderId: 'TOK1', buyerNickname: 'Cici', products: [tokoProduct()], isPreOrder: false })
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
    expect(result.scanned).toBe(0)
  })

  it('routes a Tokopedia unit with no category match to the general forum', async () => {
    tokoTab()
    ;(parseOrder as any).mockReturnValue({
      orderId: 'TOK1', buyerNickname: 'Cici', products: [tokoProduct()],
      orderDate: 1759000000, latestRtsTime: 1759600000, isPreOrder: true,
    })
    ;(createWorkingProjectsForOrder as any).mockResolvedValue(batch(1))

    const result = await autoCreateWorkingProjectsFromNewOrders()

    const arg = (createWorkingProjectsForOrder as any).mock.calls[0][0]
    expect(arg).toMatchObject({ source: 'tokopedia', sourceOrderNo: 'TOK1' })
    expect(arg.units[0]).toMatchObject({ itemKey: 'S1#1', productName: 'Gantungan Kunci', variantName: 'Merah' })
    expect(arg.base).toMatchObject({ platform: 'Tokopedia', customer: 'Cici', orderDateRaw: '2025-09-27', dueDateRaw: '2025-10-04' })
    expect(arg.base.forumChannelIdFor(arg.units[0])).toBe('ORDERS_FORUM_CHANNEL_ID')
    expect(result.created).toBe(1)
  })

  it('keeps going and records an error when one candidate fails to create', async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN1', buyerUsername: 'budi', isPreOrder: true, items: [item()], createTime: 1759000000, shipByDate: null }],
    })
    ;(createWorkingProjectsForOrder as any).mockRejectedValue(new Error('discord-relay 403'))
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(result).toEqual({ scanned: 1, created: 0, skipped: 0, failed: 1, errors: ['shopee:SN1: discord-relay 403'] })
  })

  it('keeps going (with an error) when the Shopee fetch itself fails, still scanning Tokopedia', async () => {
    ;(getReadyToShipOrders as any).mockRejectedValue(new Error('Shopee API down'))
    tokoTab()
    ;(parseOrder as any).mockReturnValue({ orderId: 'TOK1', buyerNickname: 'Cici', products: [tokoProduct()], isPreOrder: true })
    ;(createWorkingProjectsForOrder as any).mockResolvedValue(batch(1))
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(result.errors).toEqual(['shopee: gagal ambil order — Shopee API down'])
    expect(result.created).toBe(1)
  })

  it("does not abort the batch when one Shopee order's createTime is missing/invalid", async () => {
    ;(getReadyToShipOrders as any).mockResolvedValue({
      orders: [{ orderSn: 'SN1', buyerUsername: 'budi', isPreOrder: true, items: [item()], createTime: undefined, shipByDate: null }],
    })
    ;(createWorkingProjectsForOrder as any).mockResolvedValue(batch(1))
    const result = await autoCreateWorkingProjectsFromNewOrders()
    expect(result).toEqual({ scanned: 1, created: 1, skipped: 0, failed: 0, errors: [] })
    expect((createWorkingProjectsForOrder as any).mock.calls[0][0].base.orderDateRaw).toBeUndefined()
  })
})

describe('runDailyAutoCreateIfDue', () => {
  it('does nothing before the 23:00 WIB cutoff', async () => {
    const result = await runDailyAutoCreateIfDue(new Date('2026-09-28T15:00:00Z')) // 22:00 WIB
    expect(result).toBeNull()
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
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
