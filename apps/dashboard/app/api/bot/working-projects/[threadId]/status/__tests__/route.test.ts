import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ setStatus: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { PATCH } from '../route'
import { setStatus } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

function req(body: unknown) {
  return new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('PATCH /api/bot/working-projects/[threadId]/status', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await PATCH(req({ status: 'Done' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('400s without a status field', async () => {
    const res = await PATCH(req({}), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
  })

  it('delegates to setStatus and returns its result', async () => {
    ;(setStatus as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await PATCH(req({ status: 'Done' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
    expect(setStatus).toHaveBeenCalledWith('t1', 'Done', undefined)
  })
})
