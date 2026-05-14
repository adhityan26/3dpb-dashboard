export interface PlateInfo {
  namaPart: string | null
  tipe: string           // "FDM" | "SLA"
  printer: string | null
  gramasi: number
  durasiJam: number
}

export interface ProdukInternalData {
  id: string
  nama: string
  deskripsi: string | null
  kategori: string | null
  tags: string[]
  sourceModel: string | null
  imageUrl: string | null
  primaryKalkulasiId: string | null
  // Denormalized from primaryKalkulasi for convenience in UI:
  hppTotal: number | null
  floorPrice: number | null
  offlineA: number | null
  shopeeA: number | null
  hargaShopeeAktual: number | null
  kalkulasiStatus: string | null   // KalkulasiStatus value e.g. "AMAN"
  kalkulasiNama: string | null     // .nama from the linked KalkulasiHarga
  plates: PlateInfo[]              // plates from the primary kalkulasi
  shopeeLinks: { id: string; shopeeItemId: string }[]
  createdAt: string
  updatedAt: string
}

export interface ProdukInternalInput {
  nama: string
  deskripsi?: string | null
  kategori?: string | null
  tags?: string[]
  sourceModel?: string | null
}
