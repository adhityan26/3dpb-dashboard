import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    produkInternalShopeeLink: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { removeShopeeLink } from '@/lib/katalog/service'

const mockPrisma = prisma as any

describe('removeShopeeLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('matches the exact variant link by shopeeModelId', async () => {
    mockPrisma.produkInternalShopeeLink.deleteMany.mockResolvedValue({ count: 1 })
    await removeShopeeLink('produk1', 'item1', 'model1')
    expect(mockPrisma.produkInternalShopeeLink.deleteMany).toHaveBeenCalledWith({
      where: { produkInternalId: 'produk1', shopeeItemId: 'item1', shopeeModelId: 'model1' },
    })
  })

  it('matches whole-product links when no shopeeModelId given', async () => {
    mockPrisma.produkInternalShopeeLink.deleteMany.mockResolvedValue({ count: 1 })
    await removeShopeeLink('produk1', 'item1')
    expect(mockPrisma.produkInternalShopeeLink.deleteMany).toHaveBeenCalledWith({
      where: { produkInternalId: 'produk1', shopeeItemId: 'item1', shopeeModelId: null },
    })
  })
})
