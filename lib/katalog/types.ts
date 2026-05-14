export interface ProdukInternalData {
  id: string
  nama: string
  deskripsi: string | null
  primaryKalkulasiId: string | null
  // Denormalized from primaryKalkulasi for convenience in UI:
  hppTotal: number | null
  floorPrice: number | null
  offlineA: number | null
  shopeeA: number | null
  kalkulasiStatus: string | null   // KalkulasiStatus value e.g. "AMAN"
  kalkulasiNama: string | null     // .nama from the linked KalkulasiHarga
  shopeeLinks: { id: string; shopeeItemId: string }[]
  createdAt: string
  updatedAt: string
}

export interface ProdukInternalInput {
  nama: string
  deskripsi?: string
}
