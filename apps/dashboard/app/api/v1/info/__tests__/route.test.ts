import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET } from '../route'

const mockToken = vi.mocked(requireApiV1Token)

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/v1/info — auth', () => {
  it('401 tanpa token yang valid', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET({ headers: { get: () => null } } as never)
    expect(res.status).toBe(401)
  })

  it('200 dengan token valid', async () => {
    mockToken.mockReturnValue(true)
    const res = await GET({ headers: { get: () => 'Bearer t' } } as never)
    expect(res.status).toBe(200)
  })
})
