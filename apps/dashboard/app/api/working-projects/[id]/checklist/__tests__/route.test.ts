import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ runChecklistOp: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { POST } from '../route'
import { prisma } from '@/lib/db'
import { runChecklistOp } from '@/lib/working-projects/service'
import { auth } from '@/lib/auth'

function req(body?: unknown) {
  return new Request('http://localhost/api/working-projects/wp1/checklist', {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/working-projects/:id/checklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(req({ type: 'setByLabel', label: 'x', done: true, by: 'u1' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(401)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('400s on invalid type', async () => {
    const res = await POST(req({ type: 'bogus' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('400s on malformed JSON body', async () => {
    const badReq = new Request('http://localhost/api/working-projects/wp1/checklist', {
      method: 'POST',
      body: '{not valid json',
    })
    const res = await POST(badReq, { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('400s on setByLabel with wrong-shaped label/done', async () => {
    const res = await POST(req({ type: 'setByLabel', label: 123, done: 'yes' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('404s when the project does not exist', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)
    const res = await POST(req({ type: 'setByLabel', label: 'x', done: true, by: 'u1' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('409s when the project has no discordThreadId', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: null })
    const res = await POST(req({ type: 'setByLabel', label: 'x', done: true, by: 'u1' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(409)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('200s delegating to runChecklistOp via the discord thread id', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(runChecklistOp as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await POST(req({ type: 'setByLabel', label: 'x', done: true, by: 'u1' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(runChecklistOp).toHaveBeenCalledWith('t1', { type: 'setByLabel', label: 'x', done: true, by: 'u1' })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })

  it('400s on reorder with a non-numeric-array orderedIds', async () => {
    const res = await POST(req({ type: 'reorder', orderedIds: ['a', 'b'] }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(400)
    expect(runChecklistOp).not.toHaveBeenCalled()
  })

  it('200s delegating a reorder op to runChecklistOp', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(runChecklistOp as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await POST(req({ type: 'reorder', orderedIds: [2, 1] }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(runChecklistOp).toHaveBeenCalledWith('t1', { type: 'reorder', orderedIds: [2, 1] })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })
})
