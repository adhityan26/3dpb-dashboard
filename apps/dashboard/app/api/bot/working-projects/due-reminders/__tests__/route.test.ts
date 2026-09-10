import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ getDueReminders: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { GET } from '../route'
import { getDueReminders } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

describe('GET /api/bot/working-projects/due-reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await GET(new Request('http://x'))
    expect(res.status).toBe(401)
  })

  it('returns projects with a due date not yet reminded at any configured offset', async () => {
    ;(getDueReminders as any).mockResolvedValue([{ id: 'wp1', dueDate: new Date(), remindersSent: [] }])
    const res = await GET(new Request('http://x'))
    expect((await res.json())).toHaveLength(1)
  })
})
