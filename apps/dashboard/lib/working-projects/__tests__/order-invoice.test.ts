import { describe, it, expect } from 'vitest'
import { buildOrderInvoiceInput } from '../order-invoice'

const base = {
  customer: 'Budi', contact: '0812', dueDate: '2026-10-20', source: 'shopee',
  sourceOrderNo: 'SN1', platform: 'Shopee', product: 'GL Ring', variant: '7',
  itemPrice: 136500 as number | null, invoiceAmount: 273000, status: 'Open',
}

describe('buildOrderInvoiceInput', () => {
  it('makes one line per distinct unit', () => {
    const r = buildOrderInvoiceInput([base, { ...base, variant: '13' }])
    expect(r.items).toHaveLength(2)
    expect(r.items.map((i) => i.namaProduk)).toEqual(['GL Ring (7)', 'GL Ring (13)'])
    expect(r.items.every((i) => i.qty === 1 && i.hargaPerUnit === 136500)).toBe(true)
  })

  it('merges identical product+variant into qty 2', () => {
    const r = buildOrderInvoiceInput([base, base])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].qty).toBe(2)
  })

  it('ignores canceled WPs', () => {
    const r = buildOrderInvoiceInput([base, { ...base, variant: '13', status: 'Canceled' }])
    expect(r.items).toHaveLength(1)
  })

  it('falls back to one line with invoiceAmount for legacy WPs without itemPrice', () => {
    const r = buildOrderInvoiceInput([{ ...base, itemPrice: null }])
    expect(r.items).toEqual([expect.objectContaining({ qty: 1, hargaPerUnit: 273000 })])
  })

  it('derives header fields from the first active WP', () => {
    const r = buildOrderInvoiceInput([{ ...base, status: 'Canceled', customer: 'X' }, base])
    expect(r.buyerNama).toBe('Budi')
    expect(r.buyerContact).toBe('0812')
    expect(r.dueDate).toBe('2026-10-20')
    expect(r.shopeeOrderSn).toBe('SN1')
    expect(r.catatan).toBe('Order SN1')
    expect(r.items[0].channelHarga).toBe('marketplace')
    const t = buildOrderInvoiceInput([{ ...base, source: 'tokopedia' }])
    expect(t.shopeeOrderSn).toBeNull()
  })
})
