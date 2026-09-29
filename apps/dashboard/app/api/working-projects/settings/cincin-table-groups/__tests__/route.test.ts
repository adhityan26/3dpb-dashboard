import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({
  getCincinTableGroups: vi.fn(),
  setCincinTableGroups: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, PATCH } from '../route'
import { auth } from '@/lib/auth'
import { getCincinTableGroups, setCincinTableGroups } from '@/lib/working-projects/service'

function req(body?: unknown) {
  return new Request('http://localhost/api/working-projects/settings/cincin-table-groups', {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
})

describe('GET .../cincin-table-groups', () => {
  it('returns the configured groups', async () => {
    ;(getCincinTableGroups as any).mockResolvedValue([{ title: 'GL Ring 2026', keywords: ['gl'] }])
    const res = await GET()
    expect(await res.json()).toEqual({ groups: [{ title: 'GL Ring 2026', keywords: ['gl'] }] })
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('PATCH .../cincin-table-groups', () => {
  it('saves valid groups', async () => {
    const groups = [{ title: 'GL Ring 2026', keywords: ['gl'] }, { title: 'GL Ring Cosplay', keywords: ['cosplay'] }]
    const res = await PATCH(req({ groups }))
    expect(await res.json()).toEqual({ ok: true })
    expect(setCincinTableGroups).toHaveBeenCalledWith(groups)
  })

  it('400s when the body is not an array of { title, keywords }', async () => {
    const res = await PATCH(req({ groups: [{ title: '' }] }))
    expect(res.status).toBe(400)
    expect(setCincinTableGroups).not.toHaveBeenCalled()
  })

  it('400s on a keyword reused across two groups ("1 produk hanya bisa 1 table")', async () => {
    const groups = [{ title: 'GL Ring 2026', keywords: ['gl'] }, { title: 'GL Ring Cosplay', keywords: ['GL', 'cosplay'] }]
    const res = await PATCH(req({ groups }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('duplicate_keyword')
    expect(setCincinTableGroups).not.toHaveBeenCalled()
  })
})
