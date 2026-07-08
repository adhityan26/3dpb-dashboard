export interface ProdukHistoryData {
  id: string
  produkInternalId: string
  tanggal: string   // ISO string
  qty: number
  catatan: string | null
  kalkulasiId: string | null
  createdAt: string
}

export interface ProdukHistoryInput {
  tanggal?: string   // ISO string, defaults to now
  qty: number
  catatan?: string | null
  kalkulasiId?: string | null
}

export interface ProdukHistoryStats {
  totalQty: number
  totalRuns: number
  lastPrintedAt: string | null
}
