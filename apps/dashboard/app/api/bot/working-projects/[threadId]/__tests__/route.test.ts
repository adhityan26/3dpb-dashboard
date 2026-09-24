import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ updateWorkingProject: vi.fn(), deleteWorkingProject: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { GET, PATCH, DELETE } from '../route'
import { prisma } from '@/lib/db'
import { updateWorkingProject, deleteWorkingProject } from '@/lib/working-projects/service'
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

  it('400s with a clear message when updateWorkingProject rejects an unknown patch field, instead of leaking a 500', async () => {
    ;(updateWorkingProject as any).mockRejectedValue(new Error('updateWorkingProject: unknown patch field(s): orderDate'))
    const res = await PATCH(req('PATCH', { orderDate: '2026-09-01' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('unknown_patch_field')
    expect(body.message).toContain('orderDate')
  })

  it('400s with invalid_patch_value (not a 500) when updateWorkingProject rejects a bad enum value like status "done"', async () => {
    ;(updateWorkingProject as any).mockRejectedValue(new Error('updateWorkingProject: invalid patch value: status must be one of Open, Proses (got "done")'))
    const res = await PATCH(req('PATCH', { status: 'done' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_patch_value')
    expect(body.message).toContain('status must be one of')
  })
})

describe('DELETE /api/bot/working-projects/[threadId]', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
    expect(deleteWorkingProject).not.toHaveBeenCalled()
  })

  it('delegates to deleteWorkingProject and returns its result', async () => {
    ;(deleteWorkingProject as any).mockResolvedValue({ ok: true, discordDeleted: true })
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(deleteWorkingProject).toHaveBeenCalledWith('t1')
    expect(await res.json()).toEqual({ ok: true, discordDeleted: true })
  })

  it('404s cleanly when the threadId does not match any project', async () => {
    ;(deleteWorkingProject as any).mockRejectedValue(new Error('WorkingProject not found for discordThreadId=t1'))
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(404)
  })
})
