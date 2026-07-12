import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/db', () => ({ prisma: { config: { upsert: vi.fn(), findMany: vi.fn() } } }))
import { prisma } from '@/lib/db'
import { updateRate } from '../rates'
const up = vi.mocked((prisma as unknown as { config: { upsert: ReturnType<typeof vi.fn> } }).config.upsert)

beforeEach(() => vi.clearAllMocks())

describe('updateRate sync shopee fee', () => {
  it('kalk.adminEcommerce → ikut tulis kalk.channel.shopee', async () => {
    await updateRate('kalk.adminEcommerce', '1.3')
    expect(up).toHaveBeenCalledTimes(2)
    expect(up.mock.calls.map(c => c[0].where.key).sort()).toEqual(['kalk.adminEcommerce', 'kalk.channel.shopee'])
  })
  it('kalk.channel.shopee → ikut tulis kalk.adminEcommerce', async () => {
    await updateRate('kalk.channel.shopee', '1.25')
    expect(up.mock.calls.map(c => c[0].where.key).sort()).toEqual(['kalk.adminEcommerce', 'kalk.channel.shopee'])
  })
  it('key lain → 1 upsert saja', async () => {
    await updateRate('kalk.margin.a', '1.15')
    expect(up).toHaveBeenCalledTimes(1)
  })
})
