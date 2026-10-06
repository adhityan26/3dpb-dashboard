import { describe, it, expect } from 'vitest'
import { incomeFromShopeeEscrow, incomeFromTokopediaStatement, resolveWpIncome } from '../income'

const money = (amount: string) => ({ amount })

describe('incomeFromShopeeEscrow', () => {
  it('derives fees from the gap between selling price and payout', () => {
    expect(incomeFromShopeeEscrow({ order_selling_price: 90000, escrow_amount: 69752 })).toEqual({
      salePrice: 90000, feesTotal: 20248, netIncome: 69752, incomeStatus: 'settled', incomeSettledAt: null,
    })
  })
  it('returns null when escrow is not generated yet', () => {
    expect(incomeFromShopeeEscrow({ order_selling_price: 90000 })).toBeNull()
  })
  it('never reports negative fees', () => {
    expect(incomeFromShopeeEscrow({ order_selling_price: 1000, escrow_amount: 1500 })?.feesTotal).toBe(0)
  })
})

describe('incomeFromTokopediaStatement', () => {
  const base = { earning_amount: money('150000'), fees: money('-26945'), settlement_amount: money('123055') }
  it('treats status 1 as an estimate', () => {
    expect(incomeFromTokopediaStatement({ ...base, settlement_status: 1 })).toEqual({
      salePrice: 150000, feesTotal: 26945, netIncome: 123055, incomeStatus: 'estimated', incomeSettledAt: null,
    })
  })
  it('treats status 2 as settled and keeps the release time', () => {
    const r = incomeFromTokopediaStatement({ ...base, settlement_status: 2, settlement_time: '1784769070000' })
    expect(r?.incomeStatus).toBe('settled')
    expect(r?.incomeSettledAt).toEqual(new Date(1784769070000))
  })
  it('rounds a fractional amount so the Int column accepts it', () => {
    expect(incomeFromTokopediaStatement({ ...base, earning_amount: money('150000.5'), settlement_status: 1 })?.salePrice).toBe(150001)
  })
  it('returns null on missing amounts', () => {
    expect(incomeFromTokopediaStatement({ settlement_status: 2 })).toBeNull()
  })
})

describe('resolveWpIncome', () => {
  const order = { salePrice: 300000, feesTotal: 30000, netIncome: 270000, incomeStatus: 'estimated' }
  const sibs = [
    { id: 'a', itemPrice: 100000, status: 'Open' },
    { id: 'b', itemPrice: 200000, status: 'Open' },
  ]
  it('manual WP: sale price and income both equal the invoice amount, no fees', () => {
    expect(resolveWpIncome({ source: 'manual', invoiceAmount: 80000 })).toMatchObject({
      salePrice: 80000, feesTotal: 0, netIncome: 80000, status: 'manual',
    })
  })
  it('marketplace WP without an order shows nothing', () => {
    expect(resolveWpIncome({ source: 'shopee', invoiceAmount: 0 })).toBeNull()
  })
  it('order without synced income shows nothing', () => {
    expect(resolveWpIncome({ source: 'shopee', invoiceAmount: 0, order: { salePrice: null, feesTotal: null, netIncome: null } })).toBeNull()
  })
  it('two WPs of one order sum back to the order', () => {
    const a = resolveWpIncome({ id: 'a', source: 'tokopedia', invoiceAmount: 0, status: 'Open', itemPrice: 100000, order, siblings: sibs })!
    const b = resolveWpIncome({ id: 'b', source: 'tokopedia', invoiceAmount: 0, status: 'Open', itemPrice: 200000, order, siblings: sibs })!
    expect(a.salePrice + b.salePrice).toBe(300000)
    expect(a.feesTotal + b.feesTotal).toBe(30000)
    expect(a.netIncome + b.netIncome).toBe(270000)
    expect(a.status).toBe('estimated')
  })
  it('a Canceled sibling is left out of the denominator', () => {
    const siblings = [...sibs, { id: 'c', itemPrice: 100000, status: 'Canceled' }]
    const a = resolveWpIncome({ id: 'a', source: 'shopee', invoiceAmount: 0, status: 'Open', itemPrice: 100000, order, siblings })!
    const b = resolveWpIncome({ id: 'b', source: 'shopee', invoiceAmount: 0, status: 'Open', itemPrice: 200000, order, siblings })!
    expect(a.netIncome + b.netIncome).toBe(270000)
    expect(resolveWpIncome({ id: 'c', source: 'shopee', invoiceAmount: 0, status: 'Canceled', itemPrice: 100000, order, siblings })).toBeNull()
  })
  it('a legacy combined WP (no itemPrice) gets the full order', () => {
    expect(resolveWpIncome({ id: 'x', source: 'shopee', invoiceAmount: 0, order: { ...order, incomeStatus: 'settled' } }))
      .toMatchObject({ salePrice: 300000, feesTotal: 30000, netIncome: 270000, status: 'settled' })
  })
})
