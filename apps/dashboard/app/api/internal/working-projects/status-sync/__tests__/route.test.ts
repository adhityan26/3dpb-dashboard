import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/working-projects/status-sync', () => ({
  syncWorkingProjectStatusFromMarketplace: vi.fn(),
  runDailyStatusSyncIfDue: vi.fn(),
}))
import { POST } from '../route'
import { auth } from '@/lib/auth'
import { syncWorkingProjectStatusFromMarketplace, runDailyStatusSyncIfDue } from '@/lib/working-projects/status-sync'

const SECRET = 'test-internal-secret'

function req(opts: { secret?: string; force?: boolean } = {}) {
  const url = `http://localhost/api/internal/working-projects/status-sync${opts.force ? '?force=1' : ''}`
  const headers = opts.secret ? { 'x-internal-secret': opts.secret } : undefined
  return new Request(url, { method: 'POST', headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_NOTIFICATION_SECRET = SECRET
  vi.mocked(auth).mockResolvedValue(null as any)
})

describe('POST /api/internal/working-projects/status-sync', () => {
  it('403s without a valid internal secret or an OWNER session', async () => {
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(runDailyStatusSyncIfDue).not.toHaveBeenCalled()
  })

  it('403s for a non-OWNER session', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'ADMIN' } } as any)
    const res = await POST(req())
    expect(res.status).toBe(403)
  })

  it('runs the daily-if-due check with the internal secret and reports ranToday:false when not due', async () => {
    ;(runDailyStatusSyncIfDue as any).mockResolvedValue(null)
    const res = await POST(req({ secret: SECRET }))
    expect(await res.json()).toEqual({ ranToday: false })
    expect(syncWorkingProjectStatusFromMarketplace).not.toHaveBeenCalled()
  })

  it('reports the result when the daily run is due', async () => {
    ;(runDailyStatusSyncIfDue as any).mockResolvedValue({ scanned: 3, updated: 2, skipped: 1, failed: 0, errors: [] })
    const res = await POST(req({ secret: SECRET }))
    expect(await res.json()).toEqual({ ranToday: true, scanned: 3, updated: 2, skipped: 1, failed: 0, errors: [] })
  })

  it('an OWNER session with ?force=1 runs immediately, ignoring the daily cutoff', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'OWNER' } } as any)
    ;(syncWorkingProjectStatusFromMarketplace as any).mockResolvedValue({ scanned: 1, updated: 1, skipped: 0, failed: 0, errors: [] })
    const res = await POST(req({ force: true }))
    expect(await res.json()).toEqual({ ranToday: true, scanned: 1, updated: 1, skipped: 0, failed: 0, errors: [] })
    expect(runDailyStatusSyncIfDue).not.toHaveBeenCalled()
  })

  it('an OWNER session WITHOUT ?force=1 still goes through the daily-if-due check', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'OWNER' } } as any)
    ;(runDailyStatusSyncIfDue as any).mockResolvedValue(null)
    const res = await POST(req())
    expect(await res.json()).toEqual({ ranToday: false })
    expect(syncWorkingProjectStatusFromMarketplace).not.toHaveBeenCalled()
  })

  it('500s with the error message when the job throws', async () => {
    ;(runDailyStatusSyncIfDue as any).mockRejectedValue(new Error('boom'))
    const res = await POST(req({ secret: SECRET }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})
