import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  sanityRead: { fetch: mockFetch },
  sanityWrite: {
    patch: vi.fn(() => ({
      set: vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
}))

import {
  fetchAllKeycapOrders,
  fetchPendingKeycapOrders,
  countPendingKeycapOrders,
  patchKeycapOrderStatus,
} from '../sanity-helpers'
import type { SanityKeycapOrder } from '@/lib/sanity/types'

function fakeOrder(overrides: Partial<SanityKeycapOrder> = {}): SanityKeycapOrder {
  return {
    _id: 'sanity-id-1',
    orderNumber: 'KC-20260614-AB3X',
    status: 'pending',
    submittedAt: '2026-06-14T10:00:00.000Z',
    customerName: 'Budi',
    customerPhone: '08123456789',
    qty: 5,
    orientation: 'horizontal',
    bodyColor: { name: 'Navy', hex: '#1a2340' },
    keys: [],
    ...overrides,
  }
}

beforeEach(() => { mockFetch.mockReset() })

describe('fetchAllKeycapOrders', () => {
  it('returns all orders from Sanity', async () => {
    mockFetch.mockResolvedValue([fakeOrder(), fakeOrder({ _id: 'id-2', orderNumber: 'KC-20260614-XY3Z' })])
    const result = await fetchAllKeycapOrders()
    expect(result).toHaveLength(2)
    expect(result[0].orderNumber).toBe('KC-20260614-AB3X')
  })
})

describe('fetchPendingKeycapOrders', () => {
  it('returns only pending orders', async () => {
    mockFetch.mockResolvedValue([fakeOrder()])
    const result = await fetchPendingKeycapOrders()
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('pending')
  })
})

describe('countPendingKeycapOrders', () => {
  it('returns the count of pending orders', async () => {
    mockFetch.mockResolvedValue(3)
    const count = await countPendingKeycapOrders()
    expect(count).toBe(3)
  })

  it('returns 0 when no pending orders', async () => {
    mockFetch.mockResolvedValue(0)
    const count = await countPendingKeycapOrders()
    expect(count).toBe(0)
  })
})

describe('patchKeycapOrderStatus', () => {
  it('calls sanityWrite.patch with the sanity doc id', async () => {
    const { sanityWrite } = await import('@/lib/sanity/client')
    await patchKeycapOrderStatus('sanity-id-1', 'confirmed')
    expect(sanityWrite.patch).toHaveBeenCalledWith('sanity-id-1')
  })
})
