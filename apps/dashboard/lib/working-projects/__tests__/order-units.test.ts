import { describe, it, expect } from 'vitest'
import { expandOrderUnits, orderLinesFromShopee, orderLinesFromTokopedia, type OrderLine } from '../order-units'

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

describe('orderLinesFromShopee', () => {
  const it0 = { lineItemId: 99 as number | null, itemId: 5, modelId: 7 as number | null, productName: 'GL', variantName: 'S', qty: 3, cancelledQty: 1, unitPrice: 100 }
  it('qty is net of cancelled and key is the line item id', () => {
    expect(orderLinesFromShopee([it0])).toEqual([{ key: '99', productName: 'GL', variantName: 'S', qty: 2, unitPrice: 100, productId: '5' }])
  })
  it('falls back to itemId:modelId when line item id is missing', () => {
    expect(orderLinesFromShopee([{ ...it0, lineItemId: null }])[0].key).toBe('5:7')
    expect(orderLinesFromShopee([{ ...it0, lineItemId: null, modelId: null }])[0].key).toBe('5:0')
  })
})

describe('orderLinesFromTokopedia', () => {
  it('keys by sku id; empty variant and product id become null', () => {
    expect(orderLinesFromTokopedia([{ skuId: 's1', productId: '', name: 'GL', variant: '', qty: 2, unitPrice: 50 }]))
      .toEqual([{ key: 's1', productName: 'GL', variantName: null, qty: 2, unitPrice: 50, productId: null }])
    expect(orderLinesFromTokopedia([{ skuId: 's2', productId: 'p', name: 'GL', variant: '7', qty: 1, unitPrice: 50 }])[0])
      .toMatchObject({ variantName: '7', productId: 'p' })
  })
})
