import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn() }))
// Hanya fungsi ber-DB yang di-mock; parseLimit/bersihkan tetap asli supaya
// clamp dan trim benar-benar teruji lewat argumen yang diterima service.
vi.mock('@/lib/filamen/color-lookup', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/filamen/color-lookup')>()),
  cariWarnaKatalog: vi.fn(),
}))

import { requireBotToken } from '@/lib/bot/auth'
import { cariWarnaKatalog } from '@/lib/filamen/color-lookup'
import { GET } from '../route'

const mockToken = vi.mocked(requireBotToken)
const mockCari = vi.mocked(cariWarnaKatalog)

const req = (query = '') => ({
  url: `https://dash.test/api/bot/filamen/warna${query}`,
  headers: { get: () => 'Bearer t' },
}) as unknown as NextRequest

const hasil = { mode: 'nama' as const, total: 0, katalogTotal: 100, items: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockCari.mockResolvedValue(hasil)
})

describe('auth', () => {
  it('401 tanpa token valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req('?q=red'))
    expect(res.status).toBe(401)
    expect(mockCari).not.toHaveBeenCalled()
  })
})

describe('validasi input', () => {
  it('400 tanpa q, hex, maupun brand', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('q, hex, atau brand')
    expect(mockCari).not.toHaveBeenCalled()
  })

  it('400 kalau ketiganya cuma spasi', async () => {
    expect((await GET(req('?q=%20%20&brand=%20'))).status).toBe(400)
  })

  it('material sendirian tidak cukup → 400', async () => {
    expect((await GET(req('?material=pla'))).status).toBe(400)
  })

  it('400 kalau hex tidak bisa di-parse', async () => {
    mockCari.mockResolvedValue(null)
    const res = await GET(req('?hex=merah'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('hex')
  })

  it('brand sendirian boleh', async () => {
    expect((await GET(req('?brand=bambu'))).status).toBe(200)
  })
})

describe('penerusan parameter', () => {
  it('q, hex, brand, material diteruskan setelah di-trim', async () => {
    await GET(req('?q=%20red%20&hex=%23aa67eb&brand=%20bambu&material=pla'))
    expect(mockCari).toHaveBeenCalledWith({ q: 'red', hex: '#aa67eb', brand: 'bambu', material: 'pla', limit: 5 })
  })

  it('param yang tidak dikirim jadi null', async () => {
    await GET(req('?q=red'))
    expect(mockCari).toHaveBeenCalledWith({ q: 'red', hex: null, brand: null, material: null, limit: 5 })
  })

  it('limit di-clamp, bukan 400', async () => {
    for (const [query, expected] of [['&limit=0', 1], ['&limit=999', 20], ['&limit=abc', 5], ['&limit=7', 7]] as const) {
      mockCari.mockClear()
      const res = await GET(req(`?q=red${query}`))
      expect(res.status).toBe(200)
      expect(mockCari).toHaveBeenCalledWith(expect.objectContaining({ limit: expected }))
    }
  })
})

describe('respons', () => {
  it('meneruskan hasil service apa adanya', async () => {
    const isi = {
      mode: 'hex' as const, total: 412, katalogTotal: 3505,
      items: [{ brand: 'Bambu Lab', colorName: 'Purple', colorHex: '#a06eea', materials: ['PLA Basic'], deltaE: 2.4, exact: false }],
    }
    mockCari.mockResolvedValue(isi)
    const res = await GET(req('?hex=aa67eb'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(isi)
  })

  it('tidak ketemu tetap 200, bukan 404', async () => {
    expect((await GET(req('?q=tidakada'))).status).toBe(200)
  })
})
