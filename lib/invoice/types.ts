export type QuotationStatus = 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'CANCELLED'
export type ChannelHarga = 'offline' | 'marketplace'

export const PAYMENT_METHODS = ['BCA', 'Mandiri', 'BRI', 'BNI', 'Cash', 'QRIS', 'GoPay', 'OVO', 'ShopeePay', 'Transfer'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export interface InvoicePaymentData {
  id: string
  quotationId: string
  tanggal: string       // ISO
  jumlah: number
  metode: string
  catatan: string | null
  createdAt: string
}

export interface QuotationItemData {
  id: string
  quotationId: string
  produkInternalId: string | null
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: ChannelHarga
  catatan: string | null
  diskon: number           // nominal diskon per item (0 = tidak ada)
  diskonPct: number | null // persen jika input %; null jika input nominal
  subtotal: number         // qty * hargaPerUnit - diskon
}

export interface QuotationData {
  id: string
  nomor: string
  buyerNama: string
  buyerContact: string | null
  catatan: string | null
  status: QuotationStatus
  tanggal: string
  dueDate: string | null
  ongkir: number               // shipping cost, included in total
  diskonGlobal: number           // nominal diskon global
  diskonGlobalPct: number | null // persen jika input %; null jika input nominal
  shopeeOrderSn: string | null // linked Shopee order
  items: QuotationItemData[]
  payments: InvoicePaymentData[]
  subtotalProduk: number       // sum of items only
  total: number                // subtotalProduk - diskonGlobal + ongkir
  totalPaid: number            // sum of all payments
  sisaBayar: number            // total - totalPaid
  createdAt: string
  updatedAt: string
}

export interface QuotationItemInput {
  produkInternalId?: string | null
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: ChannelHarga
  catatan?: string | null
  diskon?: number        // default 0
  diskonPct?: number | null
}

export interface QuotationInput {
  tanggal?: string | null      // for backdating; null = today
  buyerNama: string
  buyerContact?: string | null
  catatan?: string | null
  dueDate?: string | null
  ongkir?: number
  diskonGlobal?: number
  diskonGlobalPct?: number | null
  shopeeOrderSn?: string | null // linked Shopee order
  items: QuotationItemInput[]
}

export interface UpdateQuotationInput {
  buyerNama?: string
  buyerContact?: string | null
  catatan?: string | null
  dueDate?: string | null
  ongkir?: number
  diskonGlobal?: number
  diskonGlobalPct?: number | null
  status?: QuotationStatus
  shopeeOrderSn?: string | null // linked Shopee order
  items?: QuotationItemInput[]
}

export interface AddPaymentInput {
  tanggal?: string | null
  jumlah: number
  metode: string
  catatan?: string | null
}

export interface QuotationListItem {
  id: string
  nomor: string
  buyerNama: string
  buyerContact: string | null
  status: QuotationStatus
  tanggal: string
  dueDate: string | null
  ongkir: number
  shopeeOrderSn: string | null // linked Shopee order
  total: number
  totalPaid: number
  sisaBayar: number
  itemCount: number
  createdAt: string
}

export interface OrderPrefill {
  shopeeOrderSn: string
  buyerUsername: string  // used as initial buyerNama
  items: { namaProduk: string; qty: number; hargaPerUnit: number }[]
  totalAmount: number
}
