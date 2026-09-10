import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))

import { GET } from '../route'
import { prisma } from '@/lib/db'

describe('GET checklist-sources', () => {
  it('401s when bot token is missing', async () => {
    const { requireBotToken } = await import('@/lib/bot/auth')
    ;(requireBotToken as any).mockReturnValueOnce(false)
    const req = new Request('http://x?q=Budi')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('excludes Canceled projects and filters by q', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([{ discordThreadId: 't1', title: 'Budi - Cincin', checklist: [] }])
    const req = new Request('http://x?q=Budi')
    const res = await GET(req)
    const body = await res.json()
    expect(body[0].title).toBe('Budi - Cincin')
    const args = (prisma.workingProject.findMany as any).mock.calls[0][0]
    expect(args.where.status.not).toBe('Canceled')
  })
})
