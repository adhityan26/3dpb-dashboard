import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn() }))
vi.mock('@/lib/kalkulator/rates', () => ({ loadRates: vi.fn() }))
// Hanya dua fungsi ber-DB yang di-mock; parseLimit tetap yang asli supaya
// clamp benar-benar teruji lewat argumen yang diterima service.
vi.mock('@/lib/kalkulator/bot-view', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/kalkulator/bot-view')>()),
  searchKalkulasiRingkas: vi.fn(),
  getKalkulasiForBot: vi.fn(),
}))

import { requireBotToken } from '@/lib/bot/auth'
import { loadRates } from '@/lib/kalkulator/rates'
import { searchKalkulasiRingkas, getKalkulasiForBot } from '@/lib/kalkulator/bot-view'
import { GET, POST } from '../route'
import { GET as GET_DETAIL } from '../[id]/route'

const mockToken = vi.mocked(requireBotToken)
const mockSearch = vi.mocked(searchKalkulasiRingkas)
const mockDetail = vi.mocked(getKalkulasiForBot)

const req = (query = '', body?: unknown) => ({
  url: `https://dash.test/api/bot/kalkulator${query}`,
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockSearch.mockResolvedValue({ items: [], total: 0 })
})

describe('GET /api/bot/kalkulator — auth', () => {
  it('401 tanpa token yang valid, dan DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req('?q=naga'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockSearch).not.toHaveBeenCalled()
  })
})

describe('GET /api/bot/kalkulator — pencarian', () => {
  it('meneruskan q ke service dan mengembalikan items + total', async () => {
    mockSearch.mockResolvedValue({ items: [{ id: 'k1', nama: 'Naga' }] as never, total: 23 })
    const res = await GET(req('?q=naga'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ id: 'k1', nama: 'Naga' }], total: 23 })
    expect(mockSearch).toHaveBeenCalledWith({ q: 'naga', limit: 5 })
  })

  it('tanpa q tetap memanggil service (mode "terbaru")', async () => {
    await GET(req(''))
    expect(mockSearch).toHaveBeenCalledWith({ q: null, limit: 5 })
  })

  it('q berisi spasi saja dianggap kosong', async () => {
    await GET(req('?q=%20%20'))
    expect(mockSearch).toHaveBeenCalledWith({ q: null, limit: 5 })
  })

  it('limit di-clamp, bukan 400', async () => {
    for (const [query, expected] of [['?limit=0', 1], ['?limit=999', 20], ['?limit=abc', 5], ['?limit=3', 3]] as const) {
      mockSearch.mockClear()
      const res = await GET(req(query))
      expect(res.status).toBe(200)
      expect(mockSearch).toHaveBeenCalledWith({ q: null, limit: expected })
    }
  })
})

describe('GET /api/bot/kalkulator/{id} — detail', () => {
  it('401 tanpa token yang valid', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET_DETAIL(req(''), ctx('k1'))
    expect(res.status).toBe(401)
    expect(mockDetail).not.toHaveBeenCalled()
  })

  it('404 saat id tidak ketemu', async () => {
    mockDetail.mockResolvedValue(null)
    const res = await GET_DETAIL(req(''), ctx('gaada'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not found' })
  })

  it('200 meneruskan hasil service apa adanya', async () => {
    mockDetail.mockResolvedValue({ id: 'k1', nama: 'Naga' } as never)
    const res = await GET_DETAIL(req(''), ctx('k1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'k1', nama: 'Naga' })
    expect(mockDetail).toHaveBeenCalledWith('k1')
  })
})

describe('POST /api/bot/kalkulator — regresi, tetap hitung ad-hoc', () => {
  beforeEach(() => {
    vi.mocked(loadRates).mockResolvedValue({
      fdmHppPerGram: 200, fdmJualPerGram: 400, slaHppPerGram: 500, slaJualPerGram: 900,
      mesinPerJam: 1000, adminEcommerce: 0, packing: {}, gantungan: {},
      switchPerPcs: 0, labelPerLembar: 0,
      failureRatePct: 12, failureSpreadPct: 50, testLayerPct: 5,
      preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
      marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
    })
  })

  it('menambah handler GET tidak merusak POST', async () => {
    const res = await POST(req('', { gramasi: 50, jam: 2 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('hppTotal')
  })

  it('POST tetap 400 untuk gramasi/jam tidak valid', async () => {
    const res = await POST(req('', { gramasi: 0, jam: 2 }))
    expect(res.status).toBe(400)
  })
})
