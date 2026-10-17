import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ createWorkingProject: vi.fn(), createWorkingProjectsForOrder: vi.fn(), summarizeOrderCreate: vi.fn((r: any) => ({ created: r.created })) }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { GET, POST } from '../route'
import { prisma } from '@/lib/db'
import { createWorkingProject, createWorkingProjectsForOrder } from '@/lib/working-projects/service'
import { auth } from '@/lib/auth'

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/working-projects', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/working-projects', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('lists all working projects', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([
      { id: 'wp1', order: null },
      { id: 'wp2', order: { id: 'o1', salePrice: 10, feesTotal: 1, netIncome: 9, incomeStatus: 'settled', incomeSettledAt: null, quotationId: null, source: 'shopee', projects: [{ id: 'wp2', itemPrice: 10, status: 'Open' }] } },
    ])
    const res = await GET(req('GET'))
    expect((prisma.workingProject.findMany as any).mock.calls[0][0].include.order.include.projects.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }])
    expect(await res.json()).toEqual([
      { id: 'wp1', order: null, siblings: [] },
      { id: 'wp2', order: { salePrice: 10, feesTotal: 1, netIncome: 9, incomeStatus: 'settled', incomeSettledAt: null, quotationId: null }, siblings: [{ id: 'wp2', itemPrice: 10, status: 'Open' }] },
    ])
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(req('GET'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/working-projects', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('creates and returns the result', async () => {
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
    const res = await POST(req('POST', { source: 'manual', forumChannelId: 'x', customer: 'y', product: 'z' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
  })

  it('401s when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(req('POST', {}))
    expect(res.status).toBe(401)
  })

  it('400s when required fields are missing', async () => {
    ;(createWorkingProject as any).mockClear()
    const res = await POST(req('POST', { source: 'manual' }))
    expect(res.status).toBe(400)
    expect(createWorkingProject).not.toHaveBeenCalled()
  })

  it('400s for a marketplace order without units', async () => {
    const res = await POST(req('POST', { source: 'shopee', sourceOrderNo: 'SN1', forumChannelId: 'x', customer: 'y', product: 'z' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'units wajib untuk order marketplace' })
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
  })

  it('creates one WP per unit for a marketplace order', async () => {
    ;(createWorkingProjectsForOrder as any).mockResolvedValue({ created: 2, skipped: 0, results: [] })
    const units = [{ itemKey: 'A#1', productName: 'p', variantName: null, unitPrice: 1, productId: null }]
    const res = await POST(req('POST', { source: 'tokopedia', sourceOrderNo: 'T1', forumChannelId: 'F', customer: 'y', product: 'z', units }))
    expect(res.status).toBe(201)
    const arg = (createWorkingProjectsForOrder as any).mock.calls[0][0]
    expect(arg).toMatchObject({ source: 'tokopedia', sourceOrderNo: 'T1', units })
    expect(arg.base.forumChannelIdFor(units[0])).toBe('F')
  })

  it('400s for malformed units without calling the service', async () => {
    ;(createWorkingProjectsForOrder as any).mockClear()
    const bad = [{ itemKey: '', productName: 'p', variantName: null, unitPrice: 1, productId: null }]
    const res = await POST(req('POST', { source: 'shopee', sourceOrderNo: 'SN1', forumChannelId: 'F', customer: 'y', product: 'z', units: bad }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/^units tidak valid/)
    expect(createWorkingProjectsForOrder).not.toHaveBeenCalled()
  })
})
