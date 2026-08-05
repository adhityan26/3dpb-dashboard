import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('@/lib/invoice/qris-decode', () => ({ decodeQrisImage: vi.fn() }))

import { GET, PUT } from './route'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decodeQrisImage } from '@/lib/invoice/qris-decode'

const mockAuth = auth as any
const mockPrisma = prisma as any
const mockDecode = decodeQrisImage as any

function makePutRequest(body: unknown) {
  return { json: async () => body } as any
}

describe('GET /api/settings/invoice-qris', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns both the image and the decoded payload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique
      .mockResolvedValueOnce({ value: 'data:image/png;base64,AAA' }) // qrisImage row
      .mockResolvedValueOnce({ value: '00020101...' }) // qrisPayload row
    const res = await GET()
    const json = await res.json()
    expect(json).toEqual({ qris: 'data:image/png;base64,AAA', qrisPayload: '00020101...' })
  })

  it('returns qrisPayload: null when no payload row exists yet', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockPrisma.config.findUnique
      .mockResolvedValueOnce({ value: 'data:image/png;base64,AAA' })
      .mockResolvedValueOnce(null)
    const res = await GET()
    const json = await res.json()
    expect(json.qrisPayload).toBeNull()
  })
})

describe('PUT /api/settings/invoice-qris', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))
    expect(res.status).toBe(401)
  })

  it('decodes successfully and stores both the image and the payload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockResolvedValue('00020101021...')

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisImage' }, update: { value: 'data:image/png;base64,AAA' } }),
    )
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisPayload' }, update: { value: '00020101021...' } }),
    )
    const json = await res.json()
    expect(json).toEqual({ qris: 'data:image/png;base64,AAA', qrisPayload: '00020101021...', decodeWarning: undefined })
  })

  it('saves the image and returns a decodeWarning when decode fails, without blocking the upload', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockResolvedValue(null)

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(res.status).toBe(200)
    expect(mockPrisma.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'invoice.qrisImage' } }),
    )
    const json = await res.json()
    expect(json.qris).toBe('data:image/png;base64,AAA')
    expect(json.qrisPayload).toBeNull()
    expect(json.decodeWarning).toMatch(/tidak terbaca/i)
  })

  it('saves the image and returns a decodeWarning when decode throws', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockDecode.mockRejectedValue(new Error('corrupt image'))

    const res = await PUT(makePutRequest({ qris: 'data:image/png;base64,AAA' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.qrisPayload).toBeNull()
    expect(json.decodeWarning).toMatch(/tidak terbaca/i)
  })

  it('skips decode entirely when qris is empty (image removed)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })

    const res = await PUT(makePutRequest({ qris: '' }))

    expect(mockDecode).not.toHaveBeenCalled()
    const json = await res.json()
    expect(json).toEqual({ qris: '', qrisPayload: null, decodeWarning: undefined })
  })

  it('still rejects a non-image data URL with 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    const res = await PUT(makePutRequest({ qris: 'not-a-data-url' }))
    expect(res.status).toBe(400)
  })
})
