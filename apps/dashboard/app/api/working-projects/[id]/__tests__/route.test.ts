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

  it('400s with a clear message when updateWorkingProject rejects an unknown patch field, instead of leaking a 500', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(updateWorkingProject as any).mockRejectedValue(new Error('updateWorkingProject: unknown patch field(s): orderDate'))
    const res = await PATCH(req('PATCH', { orderDate: '2026-09-01' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('unknown_patch_field')
    expect(body.message).toContain('orderDate')
  })

  it('400s with invalid_patch_value when updateWorkingProject rejects a bad enum value', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(updateWorkingProject as any).mockRejectedValue(new Error('updateWorkingProject: invalid patch value: source must be one of shopee, tokopedia, manual (got "lazada")'))
    const res = await PATCH(req('PATCH', { source: 'lazada' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_patch_value')
    expect(body.message).toContain('source must be one of')
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

  it('404s cleanly when the id does not match any project (Prisma P2025)', async () => {
    ;(prisma.workingProject.delete as any).mockRejectedValue(Object.assign(new Error('Record not found'), { code: 'P2025' }))
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
