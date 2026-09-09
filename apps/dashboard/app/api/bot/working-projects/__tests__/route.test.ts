import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ createWorkingProject: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
import { POST } from '../route'
import { createWorkingProject } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'

function req(body: unknown) {
  return new Request('http://localhost/api/bot/working-projects', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('POST /api/bot/working-projects', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('400s when required fields are missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('creates and returns threadUrl on valid input', async () => {
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
    const res = await POST(req({ source: 'manual', forumChannelId: 'FORUM_CINCIN_ID', customer: 'Budi', product: 'Cincin' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.threadUrl).toBe('https://discord/t1')
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await POST(req({ source: 'manual', forumChannelId: 'x', customer: 'y', product: 'z' }))
    expect(res.status).toBe(401)
  })
})
