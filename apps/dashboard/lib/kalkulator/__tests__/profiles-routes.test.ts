import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/kalkulator/profiles-service', () => ({
  listPrinterProfiles: vi.fn(), createPrinterProfile: vi.fn(),
  updatePrinterProfile: vi.fn(), deletePrinterProfile: vi.fn(), setDefaultPrinterProfile: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { GET, POST } from '@/app/api/kalkulator/printer-profiles/route'
import { DELETE } from '@/app/api/kalkulator/printer-profiles/[id]/route'
import { listPrinterProfiles, createPrinterProfile, deletePrinterProfile } from '@/lib/kalkulator/profiles-service'

const mockAuth = vi.mocked(auth)
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue({ user: { name: 'a' } }) })

describe('printer-profiles routes', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('GET mengembalikan list', async () => {
    vi.mocked(listPrinterProfiles).mockResolvedValue([{
      id: 'p1', nama: 'P1P', mesinPerJam: 4000, isDefault: true,
      watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null,
    }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json())[0].nama).toBe('P1P')
  })

  it('POST validasi nama wajib', async () => {
    const res = await POST(req({ mesinPerJam: 4000 }))
    expect(res.status).toBe(400)
  })

  it('POST INVALID_INPUT dari service → 400', async () => {
    vi.mocked(createPrinterProfile).mockRejectedValue(new Error('INVALID_INPUT'))
    const res = await POST(req({ nama: 'X' }))
    expect(res.status).toBe(400)
  })

  it('DELETE default profile → 400 DEFAULT_PROFILE', async () => {
    vi.mocked(deletePrinterProfile).mockRejectedValue(new Error('DEFAULT_PROFILE'))
    const res = await DELETE(req(undefined), ctx('p1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('DEFAULT_PROFILE')
  })
})
