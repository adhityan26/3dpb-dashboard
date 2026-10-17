import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { marketplaceOrder: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { PATCH } from '../route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

const call = (body: unknown) =>
  PATCH(new Request('http://localhost/api/working-projects/orders/o1', { method: 'PATCH', body: JSON.stringify(body) }) as any,
    { params: Promise.resolve({ id: 'o1' }) })

describe('PATCH /api/working-projects/orders/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('401s without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await call({ quotationId: 'q1' })).status).toBe(401)
  })

  it('400s when quotationId is not a non-empty string or null', async () => {
    expect((await call({ quotationId: '' })).status).toBe(400)
    expect((await call({ quotationId: 5 })).status).toBe(400)
    expect((await call({})).status).toBe(400)
  })

  it('404s when the order does not exist', async () => {
    ;(prisma.marketplaceOrder.findUnique as any).mockResolvedValue(null)
    expect((await call({ quotationId: 'q1' })).status).toBe(404)
    expect(prisma.marketplaceOrder.update).not.toHaveBeenCalled()
  })

  it('updates and returns the order', async () => {
    ;(prisma.marketplaceOrder.findUnique as any).mockResolvedValue({ id: 'o1' })
    ;(prisma.marketplaceOrder.update as any).mockResolvedValue({ id: 'o1', quotationId: 'q1' })
    const res = await call({ quotationId: 'q1' })
    expect(res.status).toBe(200)
    expect(prisma.marketplaceOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { quotationId: 'q1' } })
    expect(await res.json()).toEqual({ id: 'o1', quotationId: 'q1' })
    await call({ quotationId: null })
    expect(prisma.marketplaceOrder.update).toHaveBeenLastCalledWith({ where: { id: 'o1' }, data: { quotationId: null } })
  })
})
