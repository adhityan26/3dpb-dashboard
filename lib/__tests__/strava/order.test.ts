import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createStravaOrder,
  getStravaOrder,
  getStravaOrders,
  updateStravaOrder,
  confirmStravaOrder,
} from '@/lib/strava/service'
import type { CreateStravaOrderInput, StravaOrder } from '@/lib/strava/types'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    stravaOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

// Mock Sanity helpers
vi.mock('@/lib/strava/sanity-helpers', () => ({
  createSanityStravaOrder: vi.fn(),
  updateSanityStravaOrder: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { createSanityStravaOrder, updateSanityStravaOrder } from '@/lib/strava/sanity-helpers'

const mockPrisma = prisma as any
const mockCreateSanity = createSanityStravaOrder as any
const mockUpdateSanity = updateSanityStravaOrder as any

describe('createStravaOrder()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates orderId format (STR-*)', async () => {
    const input: CreateStravaOrderInput = {
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '081234567890',
      items: [{ productName: 'Product A', quantity: 2, unitPrice: 50000, notes: 'Custom request' }],
      totalAmount: 100000,
    }

    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001', // Auto-generated in service
      sanityDocId: null,
      status: 'pending',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
      resultPhotoKeys: [],
    }

    const mockSanityDoc = {
      _id: 'sanity-doc-1',
      orderId: 'STR-20260608-0001',
      status: 'submitted',
    }

    mockPrisma.stravaOrder.create.mockResolvedValue(mockOrder)
    mockCreateSanity.mockResolvedValue(mockSanityDoc)
    mockPrisma.stravaOrder.update.mockResolvedValue({
      ...mockOrder,
      sanityDocId: 'sanity-doc-1',
    })

    const result = await createStravaOrder(input)

    expect(result.orderId).toMatch(/^STR-\d{8}-\d{4}$/)
    expect(result.status).toBe('pending')
    expect(result.sanityDocId).toBe('sanity-doc-1')
  })

  it('creates order with sanityDocId linked', async () => {
    const input: CreateStravaOrderInput = {
      customerName: 'Jane Smith',
      customerEmail: 'jane@example.com',
      items: [{ productName: 'Product B', quantity: 1, unitPrice: 75000 }],
      totalAmount: 75000,
    }

    const mockOrder = {
      id: 'order-2',
      orderId: 'STR-20260608-0002',
      sanityDocId: null,
      status: 'pending',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
      resultPhotoKeys: [],
    }

    const mockSanityDoc = {
      _id: 'sanity-doc-2',
      orderId: 'STR-20260608-0002',
    }

    mockPrisma.stravaOrder.create.mockResolvedValue(mockOrder)
    mockCreateSanity.mockResolvedValue(mockSanityDoc)
    mockPrisma.stravaOrder.update.mockResolvedValue({
      ...mockOrder,
      sanityDocId: 'sanity-doc-2',
    })

    const result = await createStravaOrder(input)

    expect(result.sanityDocId).toBe('sanity-doc-2')
    expect(mockCreateSanity).toHaveBeenCalled()
    expect(mockPrisma.stravaOrder.update).toHaveBeenCalledWith({
      where: { id: mockOrder.id },
      data: { sanityDocId: 'sanity-doc-2' },
    })
  })

  it('rolls back PostgreSQL record if Sanity creation fails', async () => {
    const input: CreateStravaOrderInput = {
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      items: [{ productName: 'Test Product', quantity: 1, unitPrice: 50000 }],
      totalAmount: 50000,
    }

    const mockOrder = {
      id: 'order-3',
      orderId: 'STR-20260608-0003',
      sanityDocId: null,
      status: 'pending',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
      resultPhotoKeys: [],
    }

    mockPrisma.stravaOrder.create.mockResolvedValue(mockOrder)
    mockCreateSanity.mockRejectedValue(new Error('Sanity creation failed'))
    mockPrisma.stravaOrder.delete.mockResolvedValue(mockOrder)

    await expect(createStravaOrder(input)).rejects.toThrow('Sanity creation failed')
    expect(mockPrisma.stravaOrder.delete).toHaveBeenCalledWith({ where: { id: mockOrder.id } })
  })
})

describe('getStravaOrder()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches order by id and verifies data matches', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      customerPhone: '081234567890',
      items: [{ productName: 'Product A', quantity: 2, unitPrice: 50000, notes: 'Custom' }],
      totalAmount: 100000,
      status: 'pending',
      operatorNotes: null,
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: null,
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.findUnique.mockResolvedValue(mockOrder)

    const result = await getStravaOrder('order-1')

    expect(result).toBeDefined()
    expect(result?.id).toBe('order-1')
    expect(result?.orderId).toBe('STR-20260608-0001')
    expect(result?.customerName).toBe('John Doe')
    expect(result?.customerEmail).toBe('john@example.com')
    expect(result?.totalAmount).toBe(100000)
    expect(mockPrisma.stravaOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'order-1' } })
  })

  it('returns null when order not found', async () => {
    mockPrisma.stravaOrder.findUnique.mockResolvedValue(null)

    const result = await getStravaOrder('nonexistent-id')

    expect(result).toBeNull()
  })

  it('converts date fields to Date objects', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'pending',
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08T10:00:00Z'),
      confirmedAt: new Date('2026-06-08T11:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-06-08T09:00:00Z'),
      updatedAt: new Date('2026-06-08T10:00:00Z'),
    }

    mockPrisma.stravaOrder.findUnique.mockResolvedValue(mockOrder)

    const result = await getStravaOrder('order-1')

    expect(result?.submittedAt).toBeInstanceOf(Date)
    expect(result?.confirmedAt).toBeInstanceOf(Date)
    expect(result?.createdAt).toBeInstanceOf(Date)
    expect(result?.updatedAt).toBeInstanceOf(Date)
  })
})

describe('updateStravaOrder()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('changes status and verifies update', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'confirmed',
      operatorNotes: null,
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: new Date('2026-06-08'),
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.update.mockResolvedValue(mockOrder)

    const result = await updateStravaOrder('order-1', { status: 'confirmed' })

    expect(result.status).toBe('confirmed')
    expect(mockPrisma.stravaOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'confirmed' },
    })
  })

  it('syncs status change to Sanity', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'processing',
      operatorNotes: null,
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: new Date('2026-06-08'),
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.update.mockResolvedValue(mockOrder)
    mockUpdateSanity.mockResolvedValue({ _id: 'sanity-doc-1' })

    const result = await updateStravaOrder('order-1', { status: 'processing' })

    expect(result.status).toBe('processing')
    expect(mockUpdateSanity).toHaveBeenCalledWith('sanity-doc-1', { status: 'processing' })
  })

  it('updates operator notes', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'processing',
      operatorNotes: 'Order in progress',
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: new Date('2026-06-08'),
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.update.mockResolvedValue(mockOrder)

    const result = await updateStravaOrder('order-1', { operatorNotes: 'Order in progress' })

    expect(result.operatorNotes).toBe('Order in progress')
    expect(mockPrisma.stravaOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { operatorNotes: 'Order in progress' },
    })
  })

  it('does not sync to Sanity when sanityDocId is missing', async () => {
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: null,
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'confirmed',
      operatorNotes: null,
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: null,
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.update.mockResolvedValue(mockOrder)

    await updateStravaOrder('order-1', { status: 'confirmed' })

    expect(mockUpdateSanity).not.toHaveBeenCalled()
  })
})

describe('confirmStravaOrder()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets status to confirmed with timestamp', async () => {
    const confirmTime = new Date('2026-06-08T12:00:00Z')
    const mockOrder = {
      id: 'order-1',
      orderId: 'STR-20260608-0001',
      sanityDocId: 'sanity-doc-1',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      items: [],
      totalAmount: 100000,
      status: 'confirmed',
      operatorNotes: null,
      resultPhotoKeys: [],
      submittedAt: new Date('2026-06-08'),
      confirmedAt: confirmTime,
      completedAt: null,
      createdAt: new Date('2026-06-08'),
      updatedAt: new Date('2026-06-08'),
    }

    mockPrisma.stravaOrder.update.mockResolvedValue(mockOrder)
    mockUpdateSanity.mockResolvedValue({ _id: 'sanity-doc-1' })

    const result = await confirmStravaOrder('order-1')

    expect(result.status).toBe('confirmed')
    expect(result.confirmedAt).toBeDefined()
    expect(mockPrisma.stravaOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: 'confirmed',
        confirmedAt: expect.any(Date),
      }),
    })
  })
})

describe('getStravaOrders()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all orders without status filter', async () => {
    const mockOrders = [
      {
        id: 'order-1',
        orderId: 'STR-20260608-0001',
        sanityDocId: 'sanity-doc-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        items: [],
        totalAmount: 100000,
        status: 'pending',
        operatorNotes: null,
        resultPhotoKeys: [],
        submittedAt: new Date('2026-06-08'),
        confirmedAt: null,
        completedAt: null,
        createdAt: new Date('2026-06-08'),
        updatedAt: new Date('2026-06-08'),
      },
      {
        id: 'order-2',
        orderId: 'STR-20260608-0002',
        sanityDocId: 'sanity-doc-2',
        customerName: 'Jane Smith',
        customerEmail: 'jane@example.com',
        items: [],
        totalAmount: 75000,
        status: 'confirmed',
        operatorNotes: null,
        resultPhotoKeys: [],
        submittedAt: new Date('2026-06-07'),
        confirmedAt: new Date('2026-06-08'),
        completedAt: null,
        createdAt: new Date('2026-06-07'),
        updatedAt: new Date('2026-06-08'),
      },
    ]

    mockPrisma.stravaOrder.findMany.mockResolvedValue(mockOrders)

    const result = await getStravaOrders()

    expect(result).toHaveLength(2)
    expect(result[0].orderId).toBe('STR-20260608-0001')
    expect(result[1].orderId).toBe('STR-20260608-0002')
    expect(mockPrisma.stravaOrder.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { submittedAt: 'desc' },
    })
  })

  it('filters orders by status', async () => {
    const mockOrders = [
      {
        id: 'order-1',
        orderId: 'STR-20260608-0001',
        sanityDocId: 'sanity-doc-1',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        items: [],
        totalAmount: 100000,
        status: 'pending',
        operatorNotes: null,
        resultPhotoKeys: [],
        submittedAt: new Date('2026-06-08'),
        confirmedAt: null,
        completedAt: null,
        createdAt: new Date('2026-06-08'),
        updatedAt: new Date('2026-06-08'),
      },
    ]

    mockPrisma.stravaOrder.findMany.mockResolvedValue(mockOrders)

    const result = await getStravaOrders('pending')

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('pending')
    expect(mockPrisma.stravaOrder.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: { submittedAt: 'desc' },
    })
  })
})
