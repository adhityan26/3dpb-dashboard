import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { ringModel: { findFirst: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET } from '../route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

describe('GET /api/working-projects/gl-ring-model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(prisma.ringModel.findFirst).not.toHaveBeenCalled()
  })

  it('returns baseBoreMm for the model matching "2026"', async () => {
    ;(prisma.ringModel.findFirst as any).mockResolvedValue({ baseBoreMm: 23.871 })
    const res = await GET()
    expect(await res.json()).toEqual({ baseBoreMm: 23.871 })
    expect(prisma.ringModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { contains: '2026', mode: 'insensitive' } } }),
    )
  })

  it('returns null when no matching model exists or it has no baseBoreMm configured', async () => {
    ;(prisma.ringModel.findFirst as any).mockResolvedValue(null)
    const res = await GET()
    expect(await res.json()).toEqual({ baseBoreMm: null })
  })
})
