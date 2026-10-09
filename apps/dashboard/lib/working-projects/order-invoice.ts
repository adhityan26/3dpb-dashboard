// Pure builder: invoice lines for one marketplace order from its WPs.
// No db imports — safe for client bundles.
import type { QuotationInput } from '@/lib/invoice/types'

export interface OrderInvoiceWp {
  customer: string
  contact: string | null
  dueDate: string | null
  source: string
  sourceOrderNo: string | null
  platform: string | null
  product: string
  variant: string | null
  itemPrice?: number | null
  invoiceAmount: number
  status: string
}

export function buildOrderInvoiceInput(wps: OrderInvoiceWp[]): QuotationInput {
  const active = wps.filter((w) => w.status !== 'Canceled')
  const first = active[0] ?? wps[0]
  const channelHarga = first.platform && first.platform.toLowerCase() !== 'manual' ? 'marketplace' : 'offline'

  const lines = new Map<string, { namaProduk: string; qty: number; hargaPerUnit: number }>()
  for (const w of active) {
    const namaProduk = w.variant ? `${w.product} (${w.variant})` : w.product
    // Legacy combined WPs have no per-unit price: one line with the order amount.
    const hargaPerUnit = w.itemPrice ?? w.invoiceAmount
    const key = `${namaProduk}|${hargaPerUnit}`
    const line = lines.get(key)
    if (line) line.qty += 1
    else lines.set(key, { namaProduk, qty: 1, hargaPerUnit })
  }

  return {
    buyerNama: first.customer,
    buyerContact: first.contact,
    dueDate: first.dueDate,
    shopeeOrderSn: first.source === 'shopee' ? first.sourceOrderNo : null,
    catatan: first.sourceOrderNo ? `Order ${first.sourceOrderNo}` : null,
    items: [...lines.values()].map((l) => ({ ...l, channelHarga })),
  }
}
