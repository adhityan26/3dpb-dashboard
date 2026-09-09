import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/working-projects/service', () => ({ runChecklistOp: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))

import { POST } from '../route'
import { runChecklistOp } from '@/lib/working-projects/service'
import { prisma } from '@/lib/db'

describe('POST checklist', () => {
  it('401s when bot token is missing', async () => {
    const { requireBotToken } = await import('@/lib/bot/auth')
    ;(requireBotToken as any).mockReturnValueOnce(false)
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'add', text: 'x', addedBy: 'u1' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('400s on unknown op type', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'bogus' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
  })

  it('delegates known op to runChecklistOp', async () => {
    ;(runChecklistOp as any).mockResolvedValue({ ok: true, discordSynced: true })
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'add', text: 'x', addedBy: 'u1' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })

  it('400s on copy op when fromThreadId project not found', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'copy', fromThreadId: 'missing' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'fromThreadId project not found' })
    expect(runChecklistOp).not.toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'copy' }))
  })

  it('delegates copy op to runChecklistOp when fromThreadId project exists', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1' })
    ;(runChecklistOp as any).mockResolvedValue({ ok: true, discordSynced: true })
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'copy', fromThreadId: 't2' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(200)
    expect(runChecklistOp).toHaveBeenCalledWith('t1', { type: 'copy', fromThreadId: 't2' })
  })
})
