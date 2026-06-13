import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    lightGeneratorOrder: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  createInternalLgOrder,
  listLgOrders,
  countLgPendingOrders,
} from '@/lib/light-generator/service'
import { DEFAULT_LG_CONFIG } from '@/lib/light-generator/types'

const mockPrisma = prisma as any

function fakeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'LG-INT-20260613-0001',
    sanityDocId: null,
    isInternal: true,
    status: 'submitted',
    statusNote: null,
    customerName: 'Internal',
    customerContact: '-',
    notesCustomer: null,
    configJson: JSON.stringify(DEFAULT_LG_CONFIG),
    imagePath: '',
    configJsonOperator: null,
    stlPath: null,
    notesOperator: null,
    additionalImagePath: null,
    createdAt: new Date('2026-06-13T00:00:00Z'),
    updatedAt: new Date('2026-06-13T00:00:00Z'),
    ...over,
  }
}

describe('createInternalLgOrder()', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates an internal order with default config and placeholder fields', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    const result = await createInternalLgOrder()

    const arg = mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data
    expect(arg.isInternal).toBe(true)
    expect(arg.customerName).toBe('Internal')
    expect(arg.customerContact).toBe('-')
    expect(arg.imagePath).toBe('')
    expect(arg.sanityDocId).toBeNull()
    expect(arg.status).toBe('submitted')
    expect(JSON.parse(arg.configJson)).toEqual(DEFAULT_LG_CONFIG)
    expect(arg.id).toMatch(/^LG-INT-\d{8}-\d{4}$/)
    expect(result.isInternal).toBe(true)
  })

  it('uses a trimmed label as customerName when provided', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(2)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    await createInternalLgOrder('  Test Naruto  ')
    const arg = mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data
    expect(arg.customerName).toBe('Test Naruto')
    expect(arg.id).toMatch(/-0003$/)
  })

  it('falls back to "Internal" for a blank label', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    await createInternalLgOrder('   ')
    expect(mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data.customerName).toBe('Internal')
  })
})

describe('listLgOrders() internal filter', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns only internal orders when internal=true', async () => {
    mockPrisma.lightGeneratorOrder.findMany.mockResolvedValue([fakeRow()])
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(1)

    await listLgOrders({ internal: true })
    const where = mockPrisma.lightGeneratorOrder.findMany.mock.calls[0][0].where
    expect(where.isInternal).toBe(true)
  })

  it('excludes internal orders by default', async () => {
    mockPrisma.lightGeneratorOrder.findMany.mockResolvedValue([])
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)

    await listLgOrders({})
    const where = mockPrisma.lightGeneratorOrder.findMany.mock.calls[0][0].where
    expect(where.isInternal).toBe(false)
  })
})

describe('countLgPendingOrders()', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('excludes internal orders from the pending count', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(3)
    await countLgPendingOrders()
    const where = mockPrisma.lightGeneratorOrder.count.mock.calls[0][0].where
    expect(where.isInternal).toBe(false)
    expect(where.status).toEqual({ in: ['submitted', 'paid'] })
  })
})
