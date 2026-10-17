import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/shopee/orders', () => ({ getOrderDetail: vi.fn() }))
vi.mock('@/lib/tokopedia/orders', () => ({ getOrderById: vi.fn(), listOrders: vi.fn() }))
vi.mock('@/lib/tokopedia/parse', () => ({ parseOrder: vi.fn() }))
vi.mock('../service', () => ({
  updateWorkingProject: vi.fn(),
  getStatusSyncLastRunDate: vi.fn(),
  setStatusSyncLastRunDate: vi.fn(),
}))

import {
  classifyShopeeStatus,
  classifyTokopediaStatus,
  syncWorkingProjectStatusFromMarketplace,
  runDailyStatusSyncIfDue,
} from '../status-sync'
import { prisma } from '@/lib/db'
import { TokopediaError } from '@/lib/tokopedia/types'
import { getOrderDetail } from '@/lib/shopee/orders'
import { getOrderById, listOrders } from '@/lib/tokopedia/orders'
import { parseOrder } from '@/lib/tokopedia/parse'
import { updateWorkingProject, getStatusSyncLastRunDate, setStatusSyncLastRunDate } from '../service'

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.workingProject.findMany as any).mockResolvedValue([])
  // Empty list tabs by default, so Tokopedia WPs fall through to the per-order lookup path.
  ;(listOrders as any).mockResolvedValue({ total_count: 0 })
})

describe('classifyShopeeStatus', () => {
  it('maps SHIPPED/TO_CONFIRM_RECEIVE/COMPLETED/CANCELLED, leaves everything else unchanged', () => {
    expect(classifyShopeeStatus('SHIPPED')).toBe('Waiting Customer')
    expect(classifyShopeeStatus('TO_CONFIRM_RECEIVE')).toBe('Waiting Customer')
    expect(classifyShopeeStatus('COMPLETED')).toBe('Done')
    expect(classifyShopeeStatus('CANCELLED')).toBe('Canceled')
    expect(classifyShopeeStatus('READY_TO_SHIP')).toBeNull()
    expect(classifyShopeeStatus('PROCESSED')).toBeNull()
    expect(classifyShopeeStatus('RETRY_SHIP')).toBeNull()
    expect(classifyShopeeStatus('IN_CANCEL')).toBeNull()
  })
})

describe('classifyTokopediaStatus', () => {
  it('leaves 112 (label made, not picked up) unmapped — "Siap Kirim" is a manual production milestone, never set automatically', () => {
    expect(classifyTokopediaStatus(112)).toBeNull()
  })
  it('maps 120/121/122 (courier has it / in transit / delivered) to Waiting Customer', () => {
    expect(classifyTokopediaStatus(120)).toBe('Waiting Customer')
    expect(classifyTokopediaStatus(121)).toBe('Waiting Customer')
    expect(classifyTokopediaStatus(122)).toBe('Waiting Customer')
  })
  it('maps 130 (Selesai) to Done and 140 (Dibatalkan) to Canceled — verified 2026-10-04, these were previously swapped', () => {
    expect(classifyTokopediaStatus(130)).toBe('Done')
    expect(classifyTokopediaStatus(140)).toBe('Canceled')
  })
  it('leaves 110/111 (still perlu dikirim) and unknown codes unchanged', () => {
    expect(classifyTokopediaStatus(110)).toBeNull()
    expect(classifyTokopediaStatus(111)).toBeNull()
    expect(classifyTokopediaStatus(null)).toBeNull()
    expect(classifyTokopediaStatus(undefined)).toBeNull()
  })
})

describe('syncWorkingProjectStatusFromMarketplace', () => {
  it('scans every non-terminal status so a shipped WP can still advance to Done/Canceled later', async () => {
    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })
    expect(prisma.workingProject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['Open', 'Proses', 'Siap Kirim', 'Waiting Customer'] } },
    }))
  })

  it('advances a Waiting Customer Shopee WP to Done once the order is COMPLETED', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', status: 'Waiting Customer', shipping: 'JNE' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'COMPLETED' }])
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Done' })
  })

  it('does not rewrite a WP already on the target status (would re-edit its Discord post every day)', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', status: 'Waiting Customer', shipping: 'JNE' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'SHIPPED' }])

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('moves a Tokopedia WP to Canceled for a cancelled order (140) and Done for a completed one (130)', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2', status: 'Waiting Customer', shipping: 'JNE' },
    ])
    ;(getOrderById as any)
      .mockResolvedValueOnce({ order_status_module: [{ sku_display_status: 140 }] })
      .mockResolvedValueOnce({ order_status_module: [{ sku_display_status: 130 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Canceled' })
    expect(updateWorkingProject).toHaveBeenCalledWith('t2', { status: 'Done' })
  })

  it('updates a Shopee WP whose order has shipped, and counts an already-in-sync order as skipped', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1' },
      { source: 'shopee', sourceOrderNo: 'SN2', discordThreadId: 't2' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([
      { order_sn: 'SN1', order_status: 'SHIPPED' },
      { order_sn: 'SN2', order_status: 'READY_TO_SHIP' },
    ])
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledTimes(1)
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Waiting Customer' })
    expect(result).toEqual({ scanned: 2, updated: 1, skipped: 1, failed: 0, errors: [] })
  })

  it('updates a Tokopedia WP per classifyTokopediaStatus', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't3' },
    ])
    ;(getOrderById as any).mockResolvedValue({ order_status_module: [{ sku_display_status: 130 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t3', { status: 'Done' })
    expect(result.updated).toBe(1)
  })

  it('skips a row with no discordThreadId instead of throwing', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: null },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'CANCELLED' }])

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('keeps going and records an error when the Shopee update itself fails', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'SHIPPED' }])
    ;(updateWorkingProject as any).mockRejectedValue(new Error('boom'))

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(result).toEqual({ scanned: 1, updated: 0, skipped: 0, failed: 1, errors: ['shopee:SN1: boom'] })
  })

  it('backfills shipping from Shopee order detail when the WP has none yet, even if status is already in sync', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', shipping: null },
    ])
    ;(getOrderDetail as any).mockResolvedValue([
      { order_sn: 'SN1', order_status: 'READY_TO_SHIP', shipping_carrier: 'Anteraja Reguler' },
    ])
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { shipping: 'Anteraja Reguler' })
    expect(result.updated).toBe(1)
  })

  it('never overwrites a shipping value the WP already has', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', shipping: 'JNE' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([
      { order_sn: 'SN1', order_status: 'READY_TO_SHIP', shipping_carrier: 'Anteraja Reguler' },
    ])

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('backfills shipping and status together in one patch when both are due', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', shipping: null },
    ])
    ;(getOrderDetail as any).mockResolvedValue([
      { order_sn: 'SN1', order_status: 'SHIPPED', shipping_carrier: 'Anteraja Reguler' },
    ])
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Waiting Customer', shipping: 'Anteraja Reguler' })
  })

  it('backfills shipping from Tokopedia order data via parseOrder when the WP has none yet', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't3', shipping: null },
    ])
    ;(getOrderById as any).mockResolvedValue({ order_status_module: [{ sku_display_status: 110 }] })
    ;(parseOrder as any).mockReturnValue({ courier: 'JNE Reguler' })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(updateWorkingProject).toHaveBeenCalledWith('t3', { shipping: 'JNE Reguler' })
    expect(result.updated).toBe(1)
  })

  it('classifies Tokopedia WPs from the list tabs without any per-order request', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1', status: 'Waiting Customer', shipping: 'JNE' },
    ])
    ;(listOrders as any).mockImplementation((tab: string) =>
      Promise.resolve(tab === 'selesai' ? { main_orders: [{ _s: { orderId: 'TOK1', statusCode: 130, courier: 'JNE' } }] } : { main_orders: [] }))
    ;(parseOrder as any).mockImplementation((o: any) => o._s)
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(getOrderById).not.toHaveBeenCalled()
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Done' })
  })

  it('falls back to a per-order lookup only for WPs missing from the list tabs (cancelled orders appear in none)', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2', status: 'Open', shipping: 'JNE' },
    ])
    ;(listOrders as any).mockImplementation((tab: string) =>
      Promise.resolve(tab === 'dikirim' ? { main_orders: [{ _s: { orderId: 'TOK1', statusCode: 121, courier: 'JNE' } }] } : { main_orders: [] }))
    ;(parseOrder as any).mockImplementation((o: any) => o._s)
    ;(getOrderById as any).mockResolvedValue({ order_status_module: [{ sku_display_status: 140 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(getOrderById).toHaveBeenCalledTimes(1)
    expect(getOrderById).toHaveBeenCalledWith('TOK2')
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Waiting Customer' })
    expect(updateWorkingProject).toHaveBeenCalledWith('t2', { status: 'Canceled' })
  })

  it('looks up a Shopee order once even when several WPs share it', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1', status: 'Open', shipping: 'J' },
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't2', status: 'Open', shipping: 'J' },
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't3', status: 'Open', shipping: 'J' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'COMPLETED' }])
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const r = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })
    expect(getOrderDetail).toHaveBeenCalledTimes(1)
    expect(getOrderDetail).toHaveBeenCalledWith(['SN1'])
    expect(r.updated).toBe(3)
  })

  it('does one per-order Tokopedia request for an order with several WPs missing from the tabs', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK9', discordThreadId: 't1', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK9', discordThreadId: 't2', status: 'Open', shipping: 'JNE' },
    ])
    ;(parseOrder as any).mockReturnValue(null)
    ;(getOrderById as any).mockResolvedValue({ order_status_module: [{ sku_display_status: 140 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const r = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })
    expect(getOrderById).toHaveBeenCalledTimes(1)
    expect(r.updated).toBe(2)
  })

  it('skips every Tokopedia WP when reading the list tabs hits a captcha, instead of falling back to per-order requests', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2', status: 'Open', shipping: 'JNE' },
    ])
    ;(listOrders as any).mockRejectedValue(new TokopediaError('VERIFICATION_REQUIRED', 'captcha'))

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(getOrderById).not.toHaveBeenCalled()
    expect(result.skipped).toBe(2)
    expect(result.errors[0]).toContain('VERIFICATION_REQUIRED')
  })

  it('stops the Tokopedia loop at the first captcha/session error instead of hammering the rest', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2', status: 'Open', shipping: 'JNE' },
      { source: 'tokopedia', sourceOrderNo: 'TOK3', discordThreadId: 't3', status: 'Open', shipping: 'JNE' },
    ])
    ;(getOrderById as any).mockRejectedValue(new TokopediaError('VERIFICATION_REQUIRED', 'captcha'))

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(getOrderById).toHaveBeenCalledTimes(1)
    expect(result.skipped).toBe(3)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('VERIFICATION_REQUIRED')
    expect(result.errors[0]).toContain('3 WP Tokopedia dilewati')
  })

  it('keeps going when a single Tokopedia order lookup fails', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2' },
    ])
    ;(getOrderById as any)
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ order_status_module: [{ sku_display_status: 130 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace({ tokopediaGapMs: 0 })

    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.errors[0]).toContain('TOK1')
  })
})

describe('runDailyStatusSyncIfDue', () => {
  it('does nothing before the 01:00 WIB cutoff', async () => {
    const result = await runDailyStatusSyncIfDue(new Date('2026-09-29T17:30:00Z')) // 00:30 WIB
    expect(result).toBeNull()
    expect(prisma.workingProject.findMany).not.toHaveBeenCalled()
  })

  it('runs once past the cutoff and records today\'s WIB date', async () => {
    ;(getStatusSyncLastRunDate as any).mockResolvedValue(null)
    const result = await runDailyStatusSyncIfDue(new Date('2026-09-28T18:15:00Z')) // 01:15 WIB, 2026-09-29
    expect(result).toEqual({ scanned: 0, updated: 0, skipped: 0, failed: 0, errors: [] })
    expect(setStatusSyncLastRunDate).toHaveBeenCalledWith('2026-09-29')
  })

  it('does not run twice on the same WIB day', async () => {
    ;(getStatusSyncLastRunDate as any).mockResolvedValue('2026-09-29')
    const result = await runDailyStatusSyncIfDue(new Date('2026-09-28T18:15:00Z')) // still 01:15 WIB, 2026-09-29
    expect(result).toBeNull()
    expect(setStatusSyncLastRunDate).not.toHaveBeenCalled()
  })
})
