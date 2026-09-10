import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { update: vi.fn() } } }))
vi.mock('@/lib/working-projects/discord-sync', () => ({ editRelayThread: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { PATCH } from '../route'
import { prisma } from '@/lib/db'
import { editRelayThread } from '@/lib/working-projects/discord-sync'
import { requireBotToken } from '@/lib/bot/auth'

function req(body: unknown) {
  return new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('PATCH /api/bot/working-projects/[threadId]/tags', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
    ;(prisma.workingProject.update as any).mockResolvedValue({ id: 'wp1', customer: 'Budi', product: 'Cincin', variant: null })
    ;(editRelayThread as any).mockResolvedValue(undefined)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await PATCH(req({ appliedTags: ['a'] }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('400s without an appliedTags array', async () => {
    const res = await PATCH(req({}), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
  })

  it('updates tags and returns discordSynced true on success', async () => {
    const res = await PATCH(req({ appliedTags: ['urgent'] }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
    expect(prisma.workingProject.update).toHaveBeenCalledWith({
      where: { discordThreadId: 't1' },
      data: { appliedTags: ['urgent'], forumChannelId: undefined },
    })
  })

  it('returns discordSynced false when editRelayThread throws', async () => {
    ;(editRelayThread as any).mockRejectedValue(new Error('discord down'))
    const res = await PATCH(req({ appliedTags: ['urgent'] }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: false })
  })

  it('404s cleanly when the threadId does not match any project (Prisma P2025)', async () => {
    ;(prisma.workingProject.update as any).mockRejectedValue(Object.assign(new Error('Record not found'), { code: 'P2025' }))
    ;(editRelayThread as any).mockClear()
    const res = await PATCH(req({ appliedTags: ['urgent'] }), { params: Promise.resolve({ threadId: 'unknown' }) })
    expect(res.status).toBe(404)
    expect(editRelayThread).not.toHaveBeenCalled()
  })
})
