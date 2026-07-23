export type {
  PrintTipe, MarginTier, KalkulasiStatus, PackingType,
  FilamentEntry, PlateInput,
  KomponenKustomInput, KalkulatorRates, HasilKalkulasi,
  KomponenItem, LaborItem,
} from '@3pb/kalkulator-core'

import type {
  PlateInput, KomponenKustomInput, HasilKalkulasi, MarginTier,
  PackingType, KomponenItem, LaborItem,
} from '@3pb/kalkulator-core'

/** PlateInput app-level — tambahan link ke printer/material profile (resolusi di resolve-v2.ts). */
export type PlateInputApp = PlateInput & { printerProfileId?: string; materialProfileId?: string }

export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
  printerProfileId?: string | null
  materialProfileId?: string | null
  mesinPerJam?: number | null
  thumbnailKey?: string | null
}

export interface KomponenKustomData extends KomponenKustomInput {
  id: string
  kalkulasiId: string
}

export interface KalkulasiInput {
  nama: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  hargaOfflineAktual?: number
  plates: PlateInputApp[]
  komponen: KomponenItem[]
  labor: LaborItem[]
  customRiskPct?: number  // override failure rate per job (high-risk jobs)
}

export interface KalkulasiData extends HasilKalkulasi {
  id: string
  nama: string
  createdAt: string
  updatedAt: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  hargaOfflineAktual?: number
  packingType?: PackingType | null
  plates: PlateData[]
  komponenKustom: KomponenKustomData[]
  produkLinks: KalkulasiProdukData[]
  labor?: LaborItem[]
  hargaChannel?: { channelId: string; A: number; B: number; C: number }[]
}

export interface KalkulasiProdukInput {
  shopeeItemId?: string
  namaManual?: string
  isPrimary?: boolean
}

export interface KalkulasiProdukData extends KalkulasiProdukInput {
  id: string
  kalkulasiId: string
  isPrimary: boolean
}

export interface FilamentHargaData {
  id: string
  brand: string
  material: string
  hargaPerGram: number
  spoolCount: number   // 0 = manual input, >0 = auto-computed dari spool
}

export interface ResinHargaData {
  id: string
  brand: string
  grade: string
  hargaPerGram: number
}

export interface KalkulasiListResponse {
  items: KalkulasiData[]
  total: number
  page?: number
  limit?: number
}
