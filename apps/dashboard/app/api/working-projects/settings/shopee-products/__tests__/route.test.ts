import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/shopee/products', () => ({ getAllItems: vi.fn(), getItemBaseInfoBatch: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET } from '../route'
import { auth } from '@/lib/auth'
import { getAllItems, getItemBaseInfoBatch } from '@/lib/shopee/products'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET .../shopee-products', () => {
  it('returns a flat { itemId, name }[] list', async () => {
    ;(getAllItems as any).mockResolvedValue([{ item_id: 1, item_status: 'NORMAL' }])
    ;(getItemBaseInfoBatch as any).mockResolvedValue([{ item_id: 1, item_name: 'Green Lantern Ring 2026' }])
    const res = await GET()
    expect(await res.json()).toEqual({ products: [{ itemId: '1', name: 'Green Lantern Ring 2026' }] })
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('502s when the Shopee call fails', async () => {
    ;(getAllItems as any).mockRejectedValue(new Error('rate limited'))
    const res = await GET()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'rate limited' })
  })
})
