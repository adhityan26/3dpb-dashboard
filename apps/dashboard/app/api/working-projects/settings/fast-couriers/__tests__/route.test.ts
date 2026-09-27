import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({
  getFastCouriers: vi.fn(),
  setFastCouriers: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, PATCH } from '../route'
import { auth } from '@/lib/auth'
import { getFastCouriers, setFastCouriers } from '@/lib/working-projects/service'

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/working-projects/settings/fast-couriers', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET /api/working-projects/settings/fast-couriers', () => {
  it('returns the configured fast couriers', async () => {
    ;(getFastCouriers as any).mockResolvedValue(['anteraja', 'grab'])
    const res = await GET()
    expect(await res.json()).toEqual({ couriers: ['anteraja', 'grab'] })
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/working-projects/settings/fast-couriers', () => {
  it('saves the list', async () => {
    const res = await PATCH(req('PATCH', { couriers: ['paxel'] }))
    expect(await res.json()).toEqual({ ok: true })
    expect(setFastCouriers).toHaveBeenCalledWith(['paxel'])
  })

  it('400s when couriers is not an array of strings', async () => {
    const res = await PATCH(req('PATCH', { couriers: 'anteraja' }))
    expect(res.status).toBe(400)
    expect(setFastCouriers).not.toHaveBeenCalled()
  })
})
