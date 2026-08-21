import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: { spoolmanVendor: { findMany: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, POST } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindMany = vi.mocked(prisma.spoolmanVendor.findMany)
const mockUpsert = vi.mocked(prisma.spoolmanVendor.upsert)

const req = (query = '', body?: unknown) => {
  const url = `https://dash.test/api/v1/vendor${query}`
  return {
    url,
    nextUrl: new URL(url),
    headers: { get: () => 'Bearer t' },
    json: async () => body,
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockFindMany.mockResolvedValue([])
})

describe('GET /api/v1/vendor — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/vendor — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await POST(req('', { name: 'x' }))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
