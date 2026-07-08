export interface HistoryStats {
  totalQty: number
  totalRuns: number
  lastPrintedAt: string | null
}

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
  marginTier: "A" | "B" | "C" | null   // from primaryKalkulasi.marginTier
  offlineA: number | null
  offlineB: number | null
  offlineC: number | null
  shopeeA: number | null
  shopeeB: number | null
  shopeeC: number | null
  hargaOfflineAktual: number | null
  hargaShopeeAktual: number | null
  kalkulasiStatus: string | null   // KalkulasiStatus value e.g. "AMAN"
  kalkulasiNama: string | null     // .nama from the linked KalkulasiHarga
  kalkulasiBatch: number | null    // batch count from the primary kalkulasi
  plates: PlateInfo[]              // plates from the primary kalkulasi
  shopeeLinks: {
    id: string
    shopeeItemId: string
    shopeeModelId: string | null    // null = product-level, set = variant-level
    namaProduk: string | null       // display name for this variant
    kalkulasiId: string | null      // variant-specific kalkulasi override
    kalkulasiNama: string | null    // name of the variant kalkulasi
    hppTotal: number | null         // HPP from variant kalkulasi
    floorPrice: number | null
    shopeeA: number | null
    offlineA: number | null
  }[]
  historyStats: HistoryStats | null
  createdAt: string
  updatedAt: string
}

export interface ProdukInternalInput {
  nama: string
  deskripsi?: string | null
  kategori?: string | null
  tags?: string[]
  sourceModel?: string | null
  primaryKalkulasiId?: string | null
}

export interface ShopeeLinkVariantInput {
  shopeeItemId: string
  shopeeModelId?: string | null   // null = product-level
  namaProduk?: string | null
  kalkulasiId?: string | null     // set to link variant to a specific kalkulasi
}
