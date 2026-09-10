import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ markDone: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { POST } from '../route'
import { markDone } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

function req() {
  return new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer x' } })
}

describe('POST /api/bot/working-projects/[threadId]/done', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await POST(req(), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('delegates to markDone and returns its result with no body required', async () => {
    ;(markDone as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await POST(req(), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
    expect(markDone).toHaveBeenCalledWith('t1')
  })
})
