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
  it('returns null on missing amounts', () => {
    expect(incomeFromTokopediaStatement({ settlement_status: 2 })).toBeNull()
  })
})

describe('resolveWpIncome', () => {
  it('manual WP: sale price and income both equal the invoice amount, no fees', () => {
    expect(resolveWpIncome({ source: 'manual', invoiceAmount: 80000 })).toMatchObject({
      salePrice: 80000, feesTotal: 0, netIncome: 80000, status: 'manual',
    })
  })
  it('marketplace WP without synced income shows nothing', () => {
    expect(resolveWpIncome({ source: 'shopee', invoiceAmount: 0 })).toBeNull()
  })
  it('marketplace WP maps stored fields and status', () => {
    expect(resolveWpIncome({ source: 'tokopedia', invoiceAmount: 0, salePrice: 150000, feesTotal: 26945, netIncome: 123055, incomeStatus: 'estimated' }))
      .toMatchObject({ salePrice: 150000, feesTotal: 26945, netIncome: 123055, status: 'estimated' })
  })
})
