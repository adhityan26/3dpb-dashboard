import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ updateWorkingProject: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { GET, PATCH } from '../route'
import { prisma } from '@/lib/db'
import { updateWorkingProject } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

function req(method: string, body?: unknown) {
  return new Request('http://x', { method, body: body !== undefined ? JSON.stringify(body) : undefined, headers: { Authorization: 'Bearer x' } })
}

describe('GET /api/bot/working-projects/[threadId]', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await GET(req('GET'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('404s when not found', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)
    const res = await GET(req('GET'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(404)
  })

  it('returns the working project when found', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    const res = await GET(req('GET'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ id: 'wp1', discordThreadId: 't1' })
  })
})

describe('PATCH /api/bot/working-projects/[threadId]', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await PATCH(req('PATCH', { customer: 'Budi' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('delegates to updateWorkingProject with the patch body', async () => {
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await PATCH(req('PATCH', { customer: 'Budi' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { customer: 'Budi' })
  })
})
