import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    spoolmanSpool: { findUnique: vi.fn(), update: vi.fn() },
    spool: { update: vi.fn() },
  },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, PATCH } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindUnique = vi.mocked(prisma.spoolmanSpool.findUnique)

const req = (body?: unknown) => ({
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
})

describe('GET /api/v1/spool/{id} — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(), ctx('1'))
    expect(res.status).toBe(401)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/spool/{id} — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await PATCH(req({ initial_weight: 500 }), ctx('1'))
    expect(res.status).toBe(401)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
