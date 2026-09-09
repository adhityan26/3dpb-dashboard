import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ markReminderSent: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { POST } from '../route'
import { markReminderSent } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

function req(body: unknown) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('POST /api/bot/working-projects/[threadId]/reminder-sent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await POST(req({ daysLeft: 3 }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(401)
  })

  it('delegates to markReminderSent and returns its result', async () => {
    ;(markReminderSent as any).mockResolvedValue({ ok: true })
    const res = await POST(req({ daysLeft: 3 }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true })
    expect(markReminderSent).toHaveBeenCalledWith('t1', 3)
  })

  it('400s when daysLeft is missing or not a number', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
    expect(markReminderSent).not.toHaveBeenCalled()

    const res2 = await POST(req({ daysLeft: '3' }), { params: Promise.resolve({ threadId: 't1' }) })
    expect(res2.status).toBe(400)
  })

  it('404s when markReminderSent throws for an unknown threadId', async () => {
    ;(markReminderSent as any).mockRejectedValue(new Error('WorkingProject not found for discordThreadId=unknown'))
    const res = await POST(req({ daysLeft: 3 }), { params: Promise.resolve({ threadId: 'unknown' }) })
    expect(res.status).toBe(404)
  })
})
