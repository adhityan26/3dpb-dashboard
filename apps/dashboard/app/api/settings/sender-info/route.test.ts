import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

import { GET, PUT } from './route'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const mockAuth = auth as any
const mockPrisma = prisma as any

function makePutRequest(body: unknown) {
  return { json: async () => body } as any
}

describe('GET /api/settings/sender-info', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty defaults when no config row exists yet', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique.mockResolvedValue(null)
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({ senderInfo: { nama: '', telepon: '', alamat: '' } })
  })

  it('returns the saved sender info', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique.mockResolvedValue({
      value: JSON.stringify({ nama: '3D Printing Bandung', telepon: '0812', alamat: 'Jl. Contoh' }),
    })
    const res = await GET()
    const json = await res.json()
    expect(json.senderInfo).toEqual({ nama: '3D Printing Bandung', telepon: '0812', alamat: 'Jl. Contoh' })
  })
})

describe('PUT /api/settings/sender-info', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePutRequest({ nama: 'x', telepon: 'x', alamat: 'x' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when a field is missing or not a string', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const res = await PUT(makePutRequest({ nama: 'x', telepon: 'x' }))
    expect(res.status).toBe(400)
  })

  it('trims and persists the sender info as JSON', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.upsert.mockResolvedValue({})
    const res = await PUT(makePutRequest({ nama: '  Toko  ', telepon: ' 0812 ', alamat: ' Jl. X ' }))
    const json = await res.json()
    expect(json.senderInfo).toEqual({ nama: 'Toko', telepon: '0812', alamat: 'Jl. X' })
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'invoice.senderInfo' },
      update: { value: JSON.stringify({ nama: 'Toko', telepon: '0812', alamat: 'Jl. X' }) },
    }))
  })
})
