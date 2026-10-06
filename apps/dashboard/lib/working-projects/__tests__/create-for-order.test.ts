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
import { createWorkingProjectsForOrder, createWorkingProject, summarizeOrderCreate } from '../service'
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

describe('legacy WP thread retry', () => {
  const legacyRow = { id: 'old', title: 'T', customer: 'Budi', product: 'GL', variant: null, mentions: ['m1'], discordThreadId: null, syncState: 'error', checklist: [], status: 'Open', payment: 'Unpaid', invoiceAmount: 0, paidAmount: 0 }

  it('retries the thread of a legacy WP that never got one and reports it as not skipped', async () => {
    ;(prisma.workingProject.findFirst as any).mockResolvedValue(legacyRow)
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    const r = await run()
    expect(createRelayThread).toHaveBeenCalledTimes(1)
    expect((createRelayThread as any).mock.calls[0][0]).toMatchObject({ parentId: 'FORUM_CINCIN_ID', name: 'T', idempotencyKey: 'old', mentions: ['m1'] })
    expect(prisma.workingProject.create).not.toHaveBeenCalled()
    expect(r.created).toBe(0)
    expect(r.results).toEqual([{ id: 'old', threadUrl: 'https://discord/t', syncState: 'ok', skipped: false }])
    expect(summarizeOrderCreate(r).skipped).toBe(false)
  })

  it('still reports a legacy WP that already has a thread as skipped', async () => {
    ;(prisma.workingProject.findFirst as any).mockResolvedValue({ ...legacyRow, discordThreadId: 't0', syncState: 'ok' })
    const r = await run()
    expect(createRelayThread).not.toHaveBeenCalled()
    expect(summarizeOrderCreate(r).skipped).toBe(true)
  })
})

describe('unique-constraint race and per-unit failures', () => {
  const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

  it('treats P2002 on a unit create as already existing and returns the existing row', async () => {
    const existing = { id: 'won', discordThreadId: 't9', discordThreadUrl: 'u9', syncState: 'ok' }
    let calls = 0
    ;(prisma.workingProject.findFirst as any).mockImplementation(async () => (++calls === 1 ? null : existing))
    ;(prisma.workingProject.create as any).mockRejectedValue(p2002())
    const r = await createWorkingProject({ source: 'shopee', sourceOrderNo: 'SN1', sourceItemKey: 'A#1', forumChannelId: 'F', customer: 'c', product: 'p' })
    expect(r).toEqual({ id: 'won', threadUrl: 'u9', syncState: 'ok', skipped: true })
    expect(createRelayThread).not.toHaveBeenCalled()
  })

  it('rethrows a non-P2002 create error', async () => {
    ;(prisma.workingProject.create as any).mockRejectedValue(new Error('db down'))
    await expect(createWorkingProject({ source: 'shopee', sourceOrderNo: 'SN1', sourceItemKey: 'A#1', forumChannelId: 'F', customer: 'c', product: 'p' })).rejects.toThrow('db down')
  })

  it('one failing unit does not abort the rest and is counted as failed', async () => {
    let n = 0
    ;(prisma.workingProject.create as any).mockImplementation(async () => {
      if (++n === 1) throw new Error('db down')
      return { id: `wp${n}` }
    })
    const r = await run()
    expect(r).toMatchObject({ created: 1, skipped: 0, failed: 1 })
    expect(r.errors).toEqual(['A#1: db down'])
    expect(prisma.workingProject.create).toHaveBeenCalledTimes(2)
    const s = summarizeOrderCreate(r)
    expect(s.syncState).toBe('error')
    expect(s.syncError).toBe('A#1: db down')
    expect(s.skipped).toBe(false)
  })
})
