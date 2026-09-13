import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ getGLRingProductIds: vi.fn(), setGLRingProductIds: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, PATCH } from '../route'
import { getGLRingProductIds, setGLRingProductIds } from '@/lib/working-projects/service'
import { auth } from '@/lib/auth'

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/working-projects/settings/gl-ring-products', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/working-projects/settings/gl-ring-products', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('returns the configured product ids', async () => {
    ;(getGLRingProductIds as any).mockResolvedValue(['46464886596', '12345'])
    const res = await GET(req('GET'))
    expect(await res.json()).toEqual({ productIds: ['46464886596', '12345'] })
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(req('GET'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/working-projects/settings/gl-ring-products', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('saves the given product ids', async () => {
    const res = await PATCH(req('PATCH', { productIds: ['1', '2'] }))
    expect(setGLRingProductIds).toHaveBeenCalledWith(['1', '2'])
    expect(await res.json()).toEqual({ ok: true })
  })

  it('400s when productIds is not an array of strings', async () => {
    const res = await PATCH(req('PATCH', { productIds: 'not-an-array' }))
    expect(res.status).toBe(400)
    expect(setGLRingProductIds).not.toHaveBeenCalled()
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PATCH(req('PATCH', { productIds: [] }))
    expect(res.status).toBe(401)
  })
})
