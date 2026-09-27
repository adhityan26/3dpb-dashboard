import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({
  getCategoryProductIds: vi.fn(),
  setCategoryProductIds: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, PATCH } from '../[category]/route'
import { auth } from '@/lib/auth'
import { getCategoryProductIds, setCategoryProductIds } from '@/lib/working-projects/service'

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/working-projects/settings/category-product-ids/topeng', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
function params(category: string) {
  return { params: Promise.resolve({ category }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET .../category-product-ids/[category]', () => {
  it('returns the stored IDs for a valid category', async () => {
    ;(getCategoryProductIds as any).mockResolvedValue(['111', '222'])
    const res = await GET(req('GET'), params('topeng'))
    expect(await res.json()).toEqual({ productIds: ['111', '222'] })
    expect(getCategoryProductIds).toHaveBeenCalledWith('topeng')
  })

  it('404s for an unknown category (e.g. "cincin", which has its own dedicated route)', async () => {
    const res = await GET(req('GET'), params('cincin'))
    expect(res.status).toBe(404)
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(req('GET'), params('clicker'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH .../category-product-ids/[category]', () => {
  it('saves the IDs for a valid category', async () => {
    const res = await PATCH(req('PATCH', { productIds: ['333'] }), params('clicker'))
    expect(await res.json()).toEqual({ ok: true })
    expect(setCategoryProductIds).toHaveBeenCalledWith('clicker', ['333'])
  })

  it('400s when productIds is not an array of strings', async () => {
    const res = await PATCH(req('PATCH', { productIds: [1, 2] }), params('topeng'))
    expect(res.status).toBe(400)
    expect(setCategoryProductIds).not.toHaveBeenCalled()
  })

  it('404s for an unknown category', async () => {
    const res = await PATCH(req('PATCH', { productIds: [] }), params('nope'))
    expect(res.status).toBe(404)
  })
})
