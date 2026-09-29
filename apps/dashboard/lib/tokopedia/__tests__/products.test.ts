import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../orders', () => ({ listOrders: vi.fn() }))

import { getRecentTokopediaProductNames } from '../products'
import { listOrders } from '../orders'

function orderWithProducts(names: string[]) {
  return {
    sku_module: names.map((name) => ({ product_name: name, sku_name: '', quantity: 1 })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getRecentTokopediaProductNames', () => {
  it('collects distinct product names across the scanned tabs', async () => {
    ;(listOrders as any).mockImplementation((tab: string) => {
      if (tab === 'selesai') return Promise.resolve({ total_count: 1, main_orders: [orderWithProducts(['Topeng Dr Doom'])] })
      if (tab === 'dikirim') return Promise.resolve({ total_count: 1, main_orders: [orderWithProducts(['Topeng Dr Doom', 'Clicker Flat'])] })
      return Promise.resolve({ total_count: 0, main_orders: [] })
    })

    const names = await getRecentTokopediaProductNames()

    expect(names.sort()).toEqual(['Clicker Flat', 'Topeng Dr Doom'])
  })

  it('paginates until a short page signals the end', async () => {
    let calls = 0
    ;(listOrders as any).mockImplementation(() => {
      calls++
      if (calls === 1) return Promise.resolve({ total_count: 60, main_orders: Array(50).fill(orderWithProducts(['A'])) })
      return Promise.resolve({ total_count: 60, main_orders: [orderWithProducts(['B'])] })
    })

    const names = await getRecentTokopediaProductNames()

    expect(names).toContain('A')
    expect(names).toContain('B')
  })
})
