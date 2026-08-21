import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn() }))
vi.mock('@/lib/shopee/products', () => ({
  getAllItems: vi.fn(),
  getItemBaseInfoBatch: vi.fn(),
  getModelList: vi.fn(),
}))
vi.mock('@/lib/shopee/shop-category', () => ({
  getShopCategoryItems: vi.fn(),
}))

import { requireBotToken } from '@/lib/bot/auth'
import { getAllItems, getItemBaseInfoBatch, getModelList } from '@/lib/shopee/products'
import { getShopCategoryItems } from '@/lib/shopee/shop-category'
import { GET } from '../route'

const mockToken = vi.mocked(requireBotToken)
const mockAllItems = vi.mocked(getAllItems)
const mockBaseInfo = vi.mocked(getItemBaseInfoBatch)
const mockModelList = vi.mocked(getModelList)
const mockCategoryItems = vi.mocked(getShopCategoryItems)

const req = (query = '') => ({
  url: `https://dash.test/api/bot/shopee/products${query}`,
  headers: { get: () => 'Bearer t' },
}) as unknown as NextRequest

const noVariantItem = {
  item_id: 1,
  item_name: 'Filament PLA Merah',
  item_status: 'NORMAL',
  has_model: false,
  price_info: [{ current_price: 100000, original_price: 120000 }],
  stock_info_v2: { summary_info: { total_available_stock: 20 } },
}

const variantItem = {
  item_id: 2,
  item_name: 'Filament PETG Biru',
  item_status: 'NORMAL',
  has_model: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockAllItems.mockResolvedValue([{ item_id: 1, item_status: 'NORMAL' }])
  mockBaseInfo.mockResolvedValue([noVariantItem as never])
  mockModelList.mockResolvedValue({ model: [] })
})

describe('GET /api/bot/shopee/products — auth', () => {
  it('401 tanpa token valid, Shopee API tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockAllItems).not.toHaveBeenCalled()
  })
})

describe('GET /api/bot/shopee/products — happy path tanpa varian', () => {
  it('memetakan item tanpa model ke price/priceMin/priceMax dari price_info', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      products: [
        {
          itemId: 1,
          name: 'Filament PLA Merah',
          price: 100000,
          priceMin: 100000,
          priceMax: 100000,
          stock: 20,
          status: 'NORMAL',
          variants: [],
        },
      ],
      total: 1,
      hasMore: false,
    })
    expect(mockModelList).not.toHaveBeenCalled()
  })
})

describe('GET /api/bot/shopee/products — happy path dengan varian', () => {
  it('memanggil getModelList dan memetakan variants + price range', async () => {
    mockBaseInfo.mockResolvedValue([variantItem as never])
    mockModelList.mockResolvedValue({
      model: [
        { model_id: 100, model_name: 'Biru / S', price_info: [{ current_price: 90000, original_price: 90000 }], stock_info_v2: { summary_info: { total_available_stock: 5 } } },
        { model_id: 101, price_info: [{ current_price: 95000, original_price: 95000 }], stock_info_v2: { seller_stock: [{ stock: 3 }] } },
      ],
    } as never)

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mockModelList).toHaveBeenCalledWith(2)
    expect(body.products[0]).toEqual({
      itemId: 2,
      name: 'Filament PETG Biru',
      price: 90000,
      priceMin: 90000,
      priceMax: 95000,
      stock: 8,
      status: 'NORMAL',
      variants: [
        { name: 'Biru / S', price: 90000, stock: 5 },
        { name: 'Model 101', price: 95000, stock: 3 },
      ],
    })
  })
})

describe('GET /api/bot/shopee/products — filter q', () => {
  it('menyaring item_name case-insensitive', async () => {
    mockBaseInfo.mockResolvedValue([
      noVariantItem as never,
      { ...noVariantItem, item_id: 3, item_name: 'Resin Standard' } as never,
    ])

    const res = await GET(req('?q=filament'))
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.products[0].itemId).toBe(1)
  })
})

describe('GET /api/bot/shopee/products — etalase filter', () => {
  it('memakai getShopCategoryItems, bukan getAllItems', async () => {
    mockCategoryItems.mockResolvedValue({ itemIds: [1], total: 1 })
    const res = await GET(req('?etalase=5'))
    expect(res.status).toBe(200)
    expect(mockCategoryItems).toHaveBeenCalledWith(5)
    expect(mockAllItems).not.toHaveBeenCalled()
  })
})

describe('GET /api/bot/shopee/products — pagination', () => {
  it('hasMore true saat masih ada sisa item', async () => {
    mockBaseInfo.mockResolvedValue([
      noVariantItem as never,
      { ...noVariantItem, item_id: 3, item_name: 'Item B' } as never,
      { ...noVariantItem, item_id: 4, item_name: 'Item C' } as never,
    ])

    const res = await GET(req('?limit=2&offset=0'))
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.products).toHaveLength(2)
    expect(body.hasMore).toBe(true)
  })

  it('hasMore false saat halaman terakhir', async () => {
    mockBaseInfo.mockResolvedValue([
      noVariantItem as never,
      { ...noVariantItem, item_id: 3, item_name: 'Item B' } as never,
    ])

    const res = await GET(req('?limit=2&offset=0'))
    const body = await res.json()
    expect(body.hasMore).toBe(false)
  })
})

describe('GET /api/bot/shopee/products — error Shopee', () => {
  it('502 saat Shopee API melempar error', async () => {
    mockAllItems.mockRejectedValue(new Error('token expired'))
    const res = await GET(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('token expired')
  })
})
