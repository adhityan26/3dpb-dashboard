export type QuotationStatus = 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'CANCELLED'
export type ChannelHarga = 'offline' | 'marketplace'

export interface QuotationItemData {
  id: string
  quotationId: string
  produkInternalId: string | null
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: ChannelHarga
  catatan: string | null
  subtotal: number  // qty * hargaPerUnit, computed
}

export interface QuotationData {
  id: string
  nomor: string
  buyerNama: string
  buyerContact: string | null
  catatan: string | null
  status: QuotationStatus
  tanggal: string       // ISO
  dueDate: string | null
  dpAmount: number | null
  dpTanggal: string | null
  items: QuotationItemData[]
  total: number         // sum of item subtotals, computed
  sisaBayar: number     // total - dpAmount (or total if no dp), computed
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
}

export interface QuotationInput {
  buyerNama: string
  buyerContact?: string | null
  catatan?: string | null
  dueDate?: string | null
  items: QuotationItemInput[]
}

export interface UpdateQuotationInput {
  buyerNama?: string
  buyerContact?: string | null
  catatan?: string | null
  dueDate?: string | null
  status?: QuotationStatus
  dpAmount?: number | null
  dpTanggal?: string | null
  items?: QuotationItemInput[]
}

export interface QuotationListItem {
  id: string
  nomor: string
  buyerNama: string
  buyerContact: string | null
  status: QuotationStatus
  tanggal: string
  dueDate: string | null
  total: number
  dpAmount: number | null
  sisaBayar: number
  itemCount: number
  createdAt: string
}
