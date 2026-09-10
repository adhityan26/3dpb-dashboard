import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ resyncWorkingProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { POST } from '../route'
import { resyncWorkingProject } from '@/lib/working-projects/service'
import { auth } from '@/lib/auth'

function req() {
  return new Request('http://localhost/api/working-projects/wp1/resync', { method: 'POST' })
}

describe('POST /api/working-projects/:id/resync', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('delegates to resyncWorkingProject', async () => {
    ;(resyncWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await POST(req(), { params: Promise.resolve({ id: 'wp1' }) })
    expect(resyncWorkingProject).toHaveBeenCalledWith('wp1')
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(req(), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(401)
  })
})
