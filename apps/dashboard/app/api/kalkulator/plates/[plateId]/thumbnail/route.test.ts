import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    kalkulasiPlate: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/lg-storage', () => ({
  uploadToMinio: vi.fn(),
  getPresignedUrl: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadToMinio, getPresignedUrl } from '@/lib/lg-storage'
import { PUT, GET } from './route'

const mockAuth = vi.mocked(auth)
const ctx = (plateId: string) => ({ params: Promise.resolve({ plateId }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'OWNER', name: 'a' }, expires: '2099-01-01T00:00:00.000Z' } as any)
})

describe('PUT /api/kalkulator/plates/[plateId]/thumbnail', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const req = { formData: async () => new FormData() } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau plate tidak ada', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue(null)
    const form = new FormData()
    form.append('file', new File(['x'], 'plate.png', { type: 'image/png' }))
    const req = { formData: async () => form } as unknown as NextRequest
    const res = await PUT(req, ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('400 kalau tidak ada field file', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1' } as any)
    const req = { formData: async () => new FormData() } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(400)
  })

  it('upload sukses → simpan key ke kolom thumbnailKey, return key-nya', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1' } as any)
    vi.mocked(prisma.kalkulasiPlate.update).mockResolvedValue({} as any)
    const form = new FormData()
    form.append('file', new File(['x'], 'plate.png', { type: 'image/png' }))
    const req = { formData: async () => form } as unknown as NextRequest
    const res = await PUT(req, ctx('p1'))
    expect(res.status).toBe(200)
    expect(vi.mocked(uploadToMinio)).toHaveBeenCalledWith('kalkulator-thumbnails/p1.png', expect.any(Buffer), 'image/png')
    expect(vi.mocked(prisma.kalkulasiPlate.update)).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { thumbnailKey: 'kalkulator-thumbnails/p1.png' } })
    expect(await res.json()).toEqual({ thumbnailKey: 'kalkulator-thumbnails/p1.png' })
  })
})

describe('GET /api/kalkulator/plates/[plateId]/thumbnail', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau plate tidak ada', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue(null)
    const res = await GET({} as NextRequest, ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('404 kalau plate ada tapi thumbnailKey kosong', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1', thumbnailKey: null } as any)
    const res = await GET({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(404)
  })

  it('404 kalau presigned URL sukses tapi upstream fetch gagal (object udah kehapus di MinIO)', async () => {
    vi.mocked(prisma.kalkulasiPlate.findUnique).mockResolvedValue({ id: 'p1', thumbnailKey: 'kalkulator-thumbnails/p1.png' } as any)
    vi.mocked(getPresignedUrl).mockResolvedValue('https://minio.internal/signed-url')
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response)
    const res = await GET({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(404)
    expect(fetchSpy).toHaveBeenCalledWith('https://minio.internal/signed-url')
    fetchSpy.mockRestore()
  })
})
