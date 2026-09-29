import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/shopee/orders', () => ({ getOrderDetail: vi.fn() }))
vi.mock('@/lib/tokopedia/orders', () => ({ getOrderById: vi.fn() }))
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
import { getOrderDetail } from '@/lib/shopee/orders'
import { getOrderById } from '@/lib/tokopedia/orders'
import { updateWorkingProject, getStatusSyncLastRunDate, setStatusSyncLastRunDate } from '../service'

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.workingProject.findMany as any).mockResolvedValue([])
})

describe('classifyShopeeStatus', () => {
  it('maps SHIPPED/COMPLETED/CANCELLED, leaves everything else unchanged', () => {
    expect(classifyShopeeStatus('SHIPPED')).toBe('Waiting Customer')
    expect(classifyShopeeStatus('COMPLETED')).toBe('Done')
    expect(classifyShopeeStatus('CANCELLED')).toBe('Canceled')
    expect(classifyShopeeStatus('READY_TO_SHIP')).toBeNull()
    expect(classifyShopeeStatus('PROCESSED')).toBeNull()
  })
})

describe('classifyTokopediaStatus', () => {
  it('maps 112 (label made, not picked up) to Siap Kirim', () => {
    expect(classifyTokopediaStatus(112)).toBe('Siap Kirim')
  })
  it('maps 120/121/130 (courier has it) to Waiting Customer', () => {
    expect(classifyTokopediaStatus(120)).toBe('Waiting Customer')
    expect(classifyTokopediaStatus(121)).toBe('Waiting Customer')
    expect(classifyTokopediaStatus(130)).toBe('Waiting Customer')
  })
  it('maps 140 (selesai) to Done', () => {
    expect(classifyTokopediaStatus(140)).toBe('Done')
  })
  it('leaves 110/111 (still perlu dikirim) and unknown codes unchanged', () => {
    expect(classifyTokopediaStatus(110)).toBeNull()
    expect(classifyTokopediaStatus(111)).toBeNull()
    expect(classifyTokopediaStatus(null)).toBeNull()
    expect(classifyTokopediaStatus(undefined)).toBeNull()
  })
})

describe('syncWorkingProjectStatusFromMarketplace', () => {
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

    const result = await syncWorkingProjectStatusFromMarketplace()

    expect(updateWorkingProject).toHaveBeenCalledTimes(1)
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { status: 'Waiting Customer' })
    expect(result).toEqual({ scanned: 2, updated: 1, skipped: 1, failed: 0, errors: [] })
  })

  it('updates a Tokopedia WP per classifyTokopediaStatus', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't3' },
    ])
    ;(getOrderById as any).mockResolvedValue({ order_status_module: [{ sku_display_status: 140 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace()

    expect(updateWorkingProject).toHaveBeenCalledWith('t3', { status: 'Done' })
    expect(result.updated).toBe(1)
  })

  it('skips a row with no discordThreadId instead of throwing', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: null },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'CANCELLED' }])

    const result = await syncWorkingProjectStatusFromMarketplace()

    expect(updateWorkingProject).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
  })

  it('keeps going and records an error when the Shopee update itself fails', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'shopee', sourceOrderNo: 'SN1', discordThreadId: 't1' },
    ])
    ;(getOrderDetail as any).mockResolvedValue([{ order_sn: 'SN1', order_status: 'SHIPPED' }])
    ;(updateWorkingProject as any).mockRejectedValue(new Error('boom'))

    const result = await syncWorkingProjectStatusFromMarketplace()

    expect(result).toEqual({ scanned: 1, updated: 0, skipped: 0, failed: 1, errors: ['shopee:SN1: boom'] })
  })

  it('keeps going when a single Tokopedia order lookup fails', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { source: 'tokopedia', sourceOrderNo: 'TOK1', discordThreadId: 't1' },
      { source: 'tokopedia', sourceOrderNo: 'TOK2', discordThreadId: 't2' },
    ])
    ;(getOrderById as any)
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ order_status_module: [{ sku_display_status: 112 }] })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })

    const result = await syncWorkingProjectStatusFromMarketplace()

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
