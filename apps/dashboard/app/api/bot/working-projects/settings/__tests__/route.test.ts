import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ getReminderSettings: vi.fn(), setReminderSettings: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { GET, PATCH } from '../route'
import { getReminderSettings, setReminderSettings } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

describe('GET/PATCH /api/bot/working-projects/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false (GET)', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await GET(new Request('http://x'))
    expect(res.status).toBe(401)
  })

  it('GET returns defaults when unset', async () => {
    ;(getReminderSettings as any).mockResolvedValue({ reminderDays: [3, 1], defaultMentions: [] })
    const res = await GET(new Request('http://x'))
    expect(await res.json()).toEqual({ reminderDays: [3, 1], defaultMentions: [] })
  })

  it('401s when requireBotToken returns false (PATCH)', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ reminderDays: [7], defaultMentions: [] }) })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('PATCH persists via setReminderSettings', async () => {
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ reminderDays: [7], defaultMentions: ['123'] }) })
    await PATCH(req)
    expect(setReminderSettings).toHaveBeenCalledWith({ reminderDays: [7], defaultMentions: ['123'] })
  })
})
