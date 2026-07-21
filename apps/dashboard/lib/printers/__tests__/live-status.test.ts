import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: { printer: { findMany: vi.fn() } },
}))
vi.mock('@/lib/cyd-layout/mqtt-client', () => ({
  readRetained: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'
import { getPrintersWithLiveStatus } from '../live-status'

describe('getPrintersWithLiveStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gabung printer DB dengan status MQTT by slug', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: 'X1C', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({
      payload: [{ id: 'jupiter', name: 'Jupiter', type: 'X1C', state: 'running', progress: 42, remaining_min: 30, filename: 'x.gcode', error_msg: '', last_seen: '2026-01-01' }],
    }))

    const result = await getPrintersWithLiveStatus()

    expect(result).toEqual([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: 'X1C', notes: '', live: { state: 'running', progress: 42, remainingMin: 30 } },
    ])
  })

  it('printer DB tanpa slug match di MQTT -> live: null (bukan error)', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'venus', name: 'Venus', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [] }))

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: 'venus', name: 'Venus', model: '', notes: '', live: null }])
  })

  it('printer DB dengan slug null -> live: null, tak crash', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: null, name: 'Belum Diisi', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [{ id: 'jupiter', name: 'Jupiter', type: '', state: 'running', progress: 1, remaining_min: 1, filename: '', error_msg: '', last_seen: '' }] }))

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: null, name: 'Belum Diisi', model: '', notes: '', live: null }])
  })

  it('MQTT tak reachable (readRetained null) -> semua printer live: null, tak throw', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(null)

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: 'jupiter', name: 'Jupiter', model: '', notes: '', live: null }])
  })

  it('cuma ambil printer isActive (filter di query)', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([])
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [] }))

    await getPrintersWithLiveStatus()
    expect(prisma.printer.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' } })
  })
})
