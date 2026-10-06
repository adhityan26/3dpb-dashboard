import { describe, it, expect } from 'vitest'
import { expandOrderUnits, type OrderLine } from '../order-units'

const line = (over: Partial<OrderLine>): OrderLine => ({ key: 'A', productName: 'GL Ring', variantName: '7', qty: 1, unitPrice: 136500, productId: 'p1', ...over })

describe('expandOrderUnits', () => {
  it('one unit per quantity, keyed <lineKey>#<n>', () => {
    const u = expandOrderUnits([line({ qty: 2 })])
    expect(u.map((x) => x.itemKey)).toEqual(['A#1', 'A#2'])
  })
  it('two lines with different keys each start at #1', () => {
    const u = expandOrderUnits([line({ key: 'A', variantName: '7' }), line({ key: 'B', variantName: '13' })])
    expect(u.map((x) => [x.itemKey, x.variantName])).toEqual([['A#1', '7'], ['B#1', '13']])
  })
  it('numbers continue across lines that share a key', () => {
    const u = expandOrderUnits([line({ key: 'A', qty: 1 }), line({ key: 'A', qty: 2 })])
    expect(u.map((x) => x.itemKey)).toEqual(['A#1', 'A#2', 'A#3'])
  })
  it('skips lines with no active quantity', () => {
    expect(expandOrderUnits([line({ qty: 0 })])).toEqual([])
  })
})
