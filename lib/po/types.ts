export type POStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

export interface POItemData {
  id: string
  poId: string
  namaProduct: string
  kode: string | null
  qty: number
  uom: string
  harga: number
  diskon: number
  total: number
  isFilament: boolean
  brand: string | null
  material: string | null
  colorName: string | null
  filamentCatalogId: string | null
}

export interface POData {
  id: string
  nomor: string | null
  vendorNama: string
  tanggal: string
  status: POStatus
  catatan: string | null
  ongkir: number
  items: POItemData[]
  grandTotal: number
  filamentItemCount: number
  createdAt: string
}

export interface POListItem {
  id: string
  nomor: string | null
  vendorNama: string
  tanggal: string
  status: POStatus
  itemCount: number
  grandTotal: number
  ongkir: number
  filamentItemCount: number
  createdAt: string
}

export interface POItemInput {
  namaProduct: string
  kode?: string | null
  qty: number
  uom?: string
  harga: number
  diskon?: number
  total: number
  isFilament?: boolean
  brand?: string | null
  material?: string | null
  colorName?: string | null
  filamentCatalogId?: string | null
}

export interface POInput {
  nomor?: string | null
  vendorNama: string
  tanggal?: string
  catatan?: string | null
  ongkir?: number
  items: POItemInput[]
}

export interface UpdatePOInput {
  nomor?: string | null
  vendorNama?: string
  tanggal?: string
  catatan?: string | null
  status?: POStatus
  ongkir?: number
  items?: POItemInput[]
}

/** OCR result from Gemini */
export interface OCRPOResult {
  nomor?: string
  vendorNama?: string
  tanggal?: string
  ongkir?: number
  items: Array<{
    namaProduct: string
    kode?: string
    qty: number
    uom?: string
    harga: number
    diskon?: number
    total: number
    isFilament?: boolean
    brand?: string
    material?: string
    colorName?: string
  }>
}
