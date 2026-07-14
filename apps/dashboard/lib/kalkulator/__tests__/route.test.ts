import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/kalkulator/service', () => ({
  listKalkulasi: vi.fn(), createKalkulasi: vi.fn(), updateKalkulasi: vi.fn(),
  parsePagination: vi.fn(() => ({})),
}))

import { auth } from '@/lib/auth'
import { POST } from '@/app/api/kalkulator/route'
import { PUT } from '@/app/api/kalkulator/[id]/route'
import { createKalkulasi, updateKalkulasi } from '@/lib/kalkulator/service'

const mockAuth = vi.mocked(auth)
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue({ user: { name: 'a' } } as never) })

describe('kalkulator route — form kadaluarsa guard', () => {
  it('POST dengan plates tapi tanpa komponen/labor → 400 form kadaluarsa', async () => {
    const res = await POST(req({ nama: 'X', plates: [{ id: 'p1' }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('form kadaluarsa — refresh halaman')
    expect(createKalkulasi).not.toHaveBeenCalled()
  })

  it('PUT dengan plates tapi tanpa komponen/labor → 400 form kadaluarsa', async () => {
    const res = await PUT(req({ nama: 'X', plates: [{ id: 'p1' }] }), ctx('k1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('form kadaluarsa — refresh halaman')
    expect(updateKalkulasi).not.toHaveBeenCalled()
  })
})
