import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../discord-sync', () => ({
  createRelayThread: vi.fn(),
  editRelayThread: vi.fn(),
  archiveRelayThread: vi.fn(),
  deleteRelayThread: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    marketplaceOrder: { upsert: vi.fn() },
    workingProject: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    config: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
import { createWorkingProjectsForOrder } from '../service'
import { createRelayThread } from '../discord-sync'
import { prisma } from '@/lib/db'

const units = [
  { itemKey: 'A#1', productName: 'GL Ring', variantName: '7', unitPrice: 136500, productId: 'p1' },
  { itemKey: 'B#1', productName: 'GL Ring', variantName: '13', unitPrice: 136500, productId: 'p1' },
]
const base = { platform: 'Shopee', customer: 'Budi', forumChannelIdFor: () => 'FORUM_CINCIN_ID' }
const run = () => createWorkingProjectsForOrder({ source: 'shopee', sourceOrderNo: 'SN1', units, base })

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.marketplaceOrder.upsert as any).mockResolvedValue({ id: 'ord1' })
  ;(prisma.workingProject.findFirst as any).mockResolvedValue(null)
  let n = 0
  ;(prisma.workingProject.create as any).mockImplementation(async () => ({ id: `wp${++n}` }))
  ;(createRelayThread as any).mockResolvedValue({ threadId: 't', threadUrl: 'https://discord/t' })
})

describe('createWorkingProjectsForOrder', () => {
  it('creates one WP per unit linked to the MarketplaceOrder', async () => {
    const r = await run()
    expect(r.created).toBe(2)
    expect(prisma.workingProject.create).toHaveBeenCalledTimes(2)
    const datas = (prisma.workingProject.create as any).mock.calls.map((c: any) => c[0].data)
    expect(datas.map((d: any) => d.sourceItemKey)).toEqual(['A#1', 'B#1'])
    expect(datas.map((d: any) => d.variant)).toEqual(['7', '13'])
    expect(datas.every((d: any) => d.itemPrice === 136500 && d.orderId === 'ord1')).toBe(true)
  })

  it('skips the whole order when a legacy WP without an item key exists', async () => {
    ;(prisma.workingProject.findFirst as any).mockResolvedValue({ id: 'old' })
    const r = await run()
    expect(r.created).toBe(0)
    expect(prisma.workingProject.create).not.toHaveBeenCalled()
    expect(prisma.workingProject.findFirst).toHaveBeenCalledWith({
      where: { source: 'shopee', sourceOrderNo: 'SN1', sourceItemKey: null },
    })
  })

  it('skips a unit whose key already exists and creates the other', async () => {
    ;(prisma.workingProject.findFirst as any).mockImplementation(async ({ where }: any) =>
      where.sourceItemKey === 'A#1' ? { id: 'exists', discordThreadId: 't0', discordThreadUrl: 'u', syncState: 'ok' } : null,
    )
    const r = await run()
    expect(r).toMatchObject({ created: 1, skipped: 1 })
    expect(prisma.workingProject.create).toHaveBeenCalledTimes(1)
    expect((prisma.workingProject.create as any).mock.calls[0][0].data.sourceItemKey).toBe('B#1')
  })
})
