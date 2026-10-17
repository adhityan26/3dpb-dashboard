import { describe, it, expect } from 'vitest'
import { allocateOrderIncome } from '../income-allocation'

const order = { salePrice: 273000, feesTotal: 53890, netIncome: 219110 }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('allocateOrderIncome', () => {
  it('splits sale price and fees by weight and the parts add back to the order', () => {
    const r = allocateOrderIncome(order, [136500, 136500])
    expect(r.map((x) => x.salePrice)).toEqual([136500, 136500])
    expect(sum(r.map((x) => x.feesTotal))).toBe(53890)
    expect(sum(r.map((x) => x.netIncome))).toBe(219110)
  })
  it('puts the rounding remainder on the last WP', () => {
    const r = allocateOrderIncome({ salePrice: 100, feesTotal: 10, netIncome: 90 }, [1, 1, 1])
    expect(sum(r.map((x) => x.salePrice))).toBe(100)
    expect(r[0].salePrice).toBe(33)
    expect(r[2].salePrice).toBe(34)
  })
  it('weights by item price, not evenly', () => {
    const r = allocateOrderIncome({ salePrice: 300, feesTotal: 30, netIncome: 270 }, [100, 200])
    expect(r.map((x) => x.salePrice)).toEqual([100, 200])
    expect(r.map((x) => x.feesTotal)).toEqual([10, 20])
  })
  it('splits evenly when every weight is zero', () => {
    const r = allocateOrderIncome({ salePrice: 100, feesTotal: 10, netIncome: 90 }, [0, 0])
    expect(r.map((x) => x.salePrice)).toEqual([50, 50])
  })
  it('a single WP gets the whole order', () => {
    expect(allocateOrderIncome(order, [136500])).toEqual([order])
  })
  it('returns nothing for no WPs', () => {
    expect(allocateOrderIncome(order, [])).toEqual([])
  })
})
