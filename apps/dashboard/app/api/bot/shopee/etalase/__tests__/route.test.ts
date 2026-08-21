import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn() }))
vi.mock('@/lib/shopee/shop-category', () => ({
  getShopCategoryList: vi.fn(),
  getShopCategoryItems: vi.fn(),
}))

import { requireBotToken } from '@/lib/bot/auth'
import { getShopCategoryList, getShopCategoryItems } from '@/lib/shopee/shop-category'
import { GET } from '../route'

const mockToken = vi.mocked(requireBotToken)
const mockList = vi.mocked(getShopCategoryList)
const mockItems = vi.mocked(getShopCategoryItems)

const req = () => ({
  url: 'https://dash.test/api/bot/shopee/etalase',
  headers: { get: () => 'Bearer t' },
}) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockList.mockResolvedValue([])
  mockItems.mockResolvedValue({ itemIds: [], total: 0 })
})

describe('GET /api/bot/shopee/etalase — auth', () => {
  it('401 tanpa token valid, Shopee API tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('GET /api/bot/shopee/etalase — happy path', () => {
  it('mengembalikan collections dengan itemCount per kategori', async () => {
    mockList.mockResolvedValue([
      { shop_category_id: 1, name: 'Etalase A' },
      { shop_category_id: 2, name: 'Etalase B' },
    ])
    mockItems.mockImplementation(async (id: number) =>
      id === 1 ? { itemIds: [10, 11], total: 2 } : { itemIds: [20], total: 1 },
    )

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      collections: [
        { collectionId: 1, name: 'Etalase A', itemCount: 2 },
        { collectionId: 2, name: 'Etalase B', itemCount: 1 },
      ],
    })
  })

  it('502 saat Shopee API error', async () => {
    mockList.mockRejectedValue(new Error('Shopee down'))
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Shopee down')
  })
})
