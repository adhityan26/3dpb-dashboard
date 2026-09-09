import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { delete: vi.fn(), findUnique: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ updateWorkingProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { PATCH, DELETE } from '../route'
import { prisma } from '@/lib/db'
import { updateWorkingProject } from '@/lib/working-projects/service'
import { auth } from '@/lib/auth'

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/working-projects/wp1', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('PATCH /api/working-projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('delegates to updateWorkingProject via the thread id', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(updateWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await PATCH(req('PATCH', { customer: 'Budi' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(updateWorkingProject).toHaveBeenCalledWith('t1', { customer: 'Budi' })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PATCH(req('PATCH', {}), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(401)
  })

  it('404s when the project does not exist', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)
    const res = await PATCH(req('PATCH', { customer: 'Budi' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
    expect(updateWorkingProject).not.toHaveBeenCalled()
  })

  it('409s when the project has no discordThreadId', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: null })
    const res = await PATCH(req('PATCH', { customer: 'Budi' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(409)
    expect(updateWorkingProject).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/working-projects/:id', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('deletes by id', async () => {
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: 'wp1' }) })
    expect(prisma.workingProject.delete).toHaveBeenCalledWith({ where: { id: 'wp1' } })
    expect(res.status).toBe(200)
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(401)
  })
})
