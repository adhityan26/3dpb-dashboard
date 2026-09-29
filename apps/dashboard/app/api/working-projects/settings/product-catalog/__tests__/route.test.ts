import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/shopee/products', () => ({ getAllItems: vi.fn(), getItemBaseInfoBatch: vi.fn() }))
vi.mock('@/lib/tokopedia/products', () => ({ getRecentTokopediaProductNames: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET } from '../route'
import { auth } from '@/lib/auth'
import { getAllItems, getItemBaseInfoBatch } from '@/lib/shopee/products'
import { getRecentTokopediaProductNames } from '@/lib/tokopedia/products'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET .../product-catalog', () => {
  it('merges Shopee item names and Tokopedia recent product names, tagged by platform', async () => {
    ;(getAllItems as any).mockResolvedValue([{ item_id: 1, item_status: 'NORMAL' }])
    ;(getItemBaseInfoBatch as any).mockResolvedValue([{ item_id: 1, item_name: 'Green Lantern Ring 2026' }])
    ;(getRecentTokopediaProductNames as any).mockResolvedValue(['Topeng Dr Doom'])

    const res = await GET()

    expect(await res.json()).toEqual({
      products: [
        { name: 'Green Lantern Ring 2026', platform: 'shopee' },
        { name: 'Topeng Dr Doom', platform: 'tokopedia' },
      ],
    })
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('still returns the Tokopedia half when Shopee fails', async () => {
    ;(getAllItems as any).mockRejectedValue(new Error('rate limited'))
    ;(getRecentTokopediaProductNames as any).mockResolvedValue(['Topeng Dr Doom'])

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ products: [{ name: 'Topeng Dr Doom', platform: 'tokopedia' }] })
  })

  it('still returns the Shopee half when Tokopedia fails', async () => {
    ;(getAllItems as any).mockResolvedValue([{ item_id: 1, item_status: 'NORMAL' }])
    ;(getItemBaseInfoBatch as any).mockResolvedValue([{ item_id: 1, item_name: 'Green Lantern Ring 2026' }])
    ;(getRecentTokopediaProductNames as any).mockRejectedValue(new Error('SESSION_MISSING'))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ products: [{ name: 'Green Lantern Ring 2026', platform: 'shopee' }] })
  })
})
