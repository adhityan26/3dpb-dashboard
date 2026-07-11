import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { config: { findMany: vi.fn() } } }))

import { prisma } from '@/lib/db'
import { loadSettingsV2 } from '../settings-v2'

const mockFindMany = (prisma as unknown as { config: { findMany: Mock } }).config.findMany
const rows = (obj: Record<string, string>) => Object.entries(obj).map(([key, value]) => ({ key, value }))

beforeEach(() => vi.clearAllMocks())

describe('loadSettingsV2', () => {
  it('default lengkap saat Config kosong (channel fallback offline+shopee dari adminEcommerce default)', async () => {
    mockFindMany.mockResolvedValue([])
    const s = await loadSettingsV2()
    expect(s.failureSpreadPct).toBe(50)
    expect(s.testLayerPct).toBe(5)
    expect(s.marginMultipliers).toEqual({ A: 1.1, B: 1.5, C: 2.0 })
    expect(s.resellerBulkMultiplier).toBe(1.05)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
    ])
  })

  it('membaca channel dinamis kalk.channel.* — offline selalu pertama, sisanya alfabetis', async () => {
    mockFindMany.mockResolvedValue(rows({
      'kalk.channel.tokopedia': '1.1',
      'kalk.channel.offline': '1',
      'kalk.channel.shopee': '1.25',
      'kalk.failureSpread.pct': '40',
    }))
    const s = await loadSettingsV2()
    expect(s.failureSpreadPct).toBe(40)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.25 },
      { id: 'tokopedia', nama: 'Tokopedia', feeMultiplier: 1.1 },
    ])
  })

  it('nilai channel non-angka dilewati', async () => {
    mockFindMany.mockResolvedValue(rows({
      'kalk.channel.offline': '1',
      'kalk.channel.rusak': 'abc',
    }))
    const s = await loadSettingsV2()
    expect(s.channels.map(c => c.id)).toEqual(['offline'])
  })

  it('channel offline SELALU ada meski config hanya punya channel lain', async () => {
    mockFindMany.mockResolvedValue(rows({ 'kalk.channel.shopee': '1.2' }))
    const s = await loadSettingsV2()
    expect(s.channels[0]).toEqual({ id: 'offline', nama: 'Offline', feeMultiplier: 1 })
    expect(s.channels.map(c => c.id)).toEqual(['offline', 'shopee'])
  })
})
