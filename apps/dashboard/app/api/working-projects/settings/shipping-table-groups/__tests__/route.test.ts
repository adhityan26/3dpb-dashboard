import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({
  getShippingTableGroups: vi.fn(),
  setShippingTableGroups: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, PATCH } from '../route'
import { auth } from '@/lib/auth'
import { getShippingTableGroups, setShippingTableGroups } from '@/lib/working-projects/service'

function req(body?: unknown) {
  return new Request('http://localhost/api/working-projects/settings/shipping-table-groups', {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET .../shipping-table-groups', () => {
  it('returns the configured groups', async () => {
    ;(getShippingTableGroups as any).mockResolvedValue([{ title: 'GL Ring 2026', keywords: ['gl'], rowBy: 'variant' }])
    const res = await GET()
    expect(await res.json()).toEqual({ groups: [{ title: 'GL Ring 2026', keywords: ['gl'], rowBy: 'variant' }] })
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('PATCH .../shipping-table-groups', () => {
  it('saves valid groups', async () => {
    const groups = [
      { title: 'GL Ring 2026', keywords: ['gl'], rowBy: 'variant' },
      { title: 'Topeng', keywords: ['topeng'], rowBy: 'produk' },
    ]
    const res = await PATCH(req({ groups }))
    expect(await res.json()).toEqual({ ok: true })
    expect(setShippingTableGroups).toHaveBeenCalledWith(groups)
  })

  it('400s when the body is not an array of { title, keywords, rowBy }', async () => {
    const res = await PATCH(req({ groups: [{ title: '' }] }))
    expect(res.status).toBe(400)
    expect(setShippingTableGroups).not.toHaveBeenCalled()
  })

  it('400s on an invalid rowBy value', async () => {
    const groups = [{ title: 'GL Ring 2026', keywords: ['gl'], rowBy: 'nope' }]
    const res = await PATCH(req({ groups }))
    expect(res.status).toBe(400)
    expect(setShippingTableGroups).not.toHaveBeenCalled()
  })

  it('400s on a keyword reused across two groups ("1 produk hanya bisa 1 table")', async () => {
    const groups = [
      { title: 'GL Ring 2026', keywords: ['gl'], rowBy: 'variant' },
      { title: 'GL Ring Cosplay', keywords: ['GL', 'cosplay'], rowBy: 'variant' },
    ]
    const res = await PATCH(req({ groups }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('duplicate_keyword')
    expect(setShippingTableGroups).not.toHaveBeenCalled()
  })
})
