import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    purchaseOrder: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    purchaseOrderItem: {
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/kalkulator/service', () => ({ recomputeFilamentHarga: vi.fn() }))

import { prisma } from '@/lib/db'
import { createPO, updatePO } from '@/lib/po/service'
import { DuplicatePONomorError } from '@/lib/po/types'

const mockPrisma = prisma as any

function baseInput(over: Record<string, unknown> = {}) {
  return {
    nomor: 'PO-001',
    vendorNama: 'Vendor A',
    items: [{ namaProduct: 'Filament PLA', qty: 1, harga: 100000, total: 100000 }],
    ...over,
  }
}

function fakeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'po1', nomor: 'PO-001', vendorNama: 'Vendor A',
    tanggal: new Date('2026-07-11T00:00:00Z'), status: 'DRAFT', catatan: null, ongkir: 0,
    items: [], createdAt: new Date('2026-07-11T00:00:00Z'),
    ...over,
  }
}

describe('createPO — duplicate nomor validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when nomor already exists', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(fakeRow())
    await expect(createPO(baseInput())).rejects.toThrow(DuplicatePONomorError)
    expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('allows when nomor is unique', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null)
    mockPrisma.purchaseOrder.create.mockResolvedValue(fakeRow())
    const result = await createPO(baseInput())
    expect(result.nomor).toBe('PO-001')
    expect(mockPrisma.purchaseOrder.create).toHaveBeenCalled()
  })

  it('allows multiple POs with no nomor (null)', async () => {
    mockPrisma.purchaseOrder.create.mockResolvedValue(fakeRow({ nomor: null }))
    const result = await createPO(baseInput({ nomor: null }))
    expect(result.nomor).toBeNull()
    expect(mockPrisma.purchaseOrder.findFirst).not.toHaveBeenCalled()
  })
})

describe('updatePO — duplicate nomor validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when renaming to a nomor used by another PO', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(fakeRow({ id: 'po2' }))
    await expect(updatePO('po1', { nomor: 'PO-001' })).rejects.toThrow(DuplicatePONomorError)
    expect(mockPrisma.purchaseOrder.update).not.toHaveBeenCalled()
  })

  it('allows keeping its own nomor unchanged', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null)
    mockPrisma.purchaseOrder.update.mockResolvedValue(fakeRow())
    const result = await updatePO('po1', { nomor: 'PO-001' })
    expect(result.nomor).toBe('PO-001')
  })
})
