import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/cyd-layout/field-preset-service', () => ({
  listFieldPresets: vi.fn(),
  createFieldPreset: vi.fn(),
  updateFieldPreset: vi.fn(),
  deleteFieldPreset: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { listFieldPresets, createFieldPreset, updateFieldPreset, deleteFieldPreset } from '@/lib/cyd-layout/field-preset-service'
import { GET, POST } from '../route'
import { PATCH, DELETE } from '../[id]/route'

const mockAuth = vi.mocked(auth)
const session = { user: { id: 'u1', role: 'OWNER', name: 'a' }, expires: '2099-01-01T00:00:00.000Z' } as any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/cyd-field-presets', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('200 + hasil service dengan session', async () => {
    mockAuth.mockResolvedValue(session)
    const presets = [{ id: 'p1', name: 'Ringkas', fields: [] }]
    vi.mocked(listFieldPresets).mockResolvedValue(presets as any)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(presets)
  })
})

describe('POST /api/cyd-field-presets', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(jsonReq({ name: 'x', fields: [] }))
    expect(res.status).toBe(401)
  })

  it('400 kalau service throw NAME_REQUIRED', async () => {
    mockAuth.mockResolvedValue(session)
    vi.mocked(createFieldPreset).mockRejectedValue(new Error('NAME_REQUIRED'))
    const res = await POST(jsonReq({ name: '', fields: [] }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'NAME_REQUIRED' })
  })

  it('201 kalau service sukses', async () => {
    mockAuth.mockResolvedValue(session)
    const created = { id: 'p2', name: 'Detail', fields: [] }
    vi.mocked(createFieldPreset).mockResolvedValue(created as any)
    const res = await POST(jsonReq({ name: 'Detail', fields: [] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
  })
})

describe('PATCH /api/cyd-field-presets/[id]', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PATCH(jsonReq({ name: 'x' }), ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau service throw NOT_FOUND', async () => {
    mockAuth.mockResolvedValue(session)
    vi.mocked(updateFieldPreset).mockRejectedValue(new Error('NOT_FOUND'))
    const res = await PATCH(jsonReq({ name: 'x' }), ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('400 kalau service throw error lain', async () => {
    mockAuth.mockResolvedValue(session)
    vi.mocked(updateFieldPreset).mockRejectedValue(new Error('NAME_REQUIRED'))
    const res = await PATCH(jsonReq({ name: '' }), ctx('p1'))
    expect(res.status).toBe(400)
  })

  it('200 kalau service sukses', async () => {
    mockAuth.mockResolvedValue(session)
    const updated = { id: 'p1', name: 'Updated', fields: [] }
    vi.mocked(updateFieldPreset).mockResolvedValue(updated as any)
    const res = await PATCH(jsonReq({ name: 'Updated' }), ctx('p1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
  })
})

describe('DELETE /api/cyd-field-presets/[id]', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await DELETE({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(401)
  })

  it('404 kalau service throw NOT_FOUND', async () => {
    mockAuth.mockResolvedValue(session)
    vi.mocked(deleteFieldPreset).mockRejectedValue(new Error('NOT_FOUND'))
    const res = await DELETE({} as NextRequest, ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('204 kalau service sukses', async () => {
    mockAuth.mockResolvedValue(session)
    vi.mocked(deleteFieldPreset).mockResolvedValue(undefined as any)
    const res = await DELETE({} as NextRequest, ctx('p1'))
    expect(res.status).toBe(204)
  })
})
