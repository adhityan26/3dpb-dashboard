import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
const mockSaveSession = vi.fn()
const mockGetSessionStatus = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/tokopedia/session', () => ({
  saveSession: (cookies: unknown) => mockSaveSession(cookies),
  getSessionStatus: () => mockGetSessionStatus(),
}))

import { GET, POST } from '../route'

const ORIGINAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN

beforeEach(() => {
  mockAuth.mockReset(); mockSaveSession.mockReset(); mockGetSessionStatus.mockReset()
  process.env.INTERNAL_SERVICE_TOKEN = 'test-secret-token'
})

afterEach(() => {
  process.env.INTERNAL_SERVICE_TOKEN = ORIGINAL_TOKEN
})

function reqWithHeader(headerValue?: string): Request {
  const headers = new Headers()
  if (headerValue !== undefined) headers.set('X-Internal-Token', headerValue)
  return new Request('http://localhost/api/tokopedia/session', { headers })
}

describe('GET /api/tokopedia/session auth', () => {
  it('tanpa session dan tanpa header -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(reqWithHeader() as never)
    expect(res.status).toBe(401)
  })

  it('dengan session user -> lolos, panggil getSessionStatus (perilaku lama)', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockGetSessionStatus.mockResolvedValue({ exists: false })
    const res = await GET(reqWithHeader() as never)
    expect(res.status).toBe(200)
    expect(mockGetSessionStatus).toHaveBeenCalled()
  })

  it('tanpa session tapi header token cocok -> lolos', async () => {
    mockAuth.mockResolvedValue(null)
    mockGetSessionStatus.mockResolvedValue({ exists: false })
    const res = await GET(reqWithHeader('test-secret-token') as never)
    expect(res.status).toBe(200)
  })

  it('tanpa session, header token salah -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(reqWithHeader('wrong-token') as never)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/tokopedia/session auth', () => {
  it('tanpa session dan tanpa header -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new Request('http://localhost/api/tokopedia/session', {
      method: 'POST', body: JSON.stringify({ cookies: [] }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('header token cocok -> lolos, panggil saveSession', async () => {
    mockAuth.mockResolvedValue(null)
    mockSaveSession.mockResolvedValue({ sellerId: 's1', appId: 'a1', updatedAt: 'now', tokenExpiry: null })
    const headers = new Headers({ 'X-Internal-Token': 'test-secret-token' })
    const req = new Request('http://localhost/api/tokopedia/session', {
      method: 'POST', headers, body: JSON.stringify({ cookies: [{ name: 'SELLER_TOKEN', value: 'x' }] }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    expect(mockSaveSession).toHaveBeenCalled()
  })
})
