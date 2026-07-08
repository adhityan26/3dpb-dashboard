export type {
  PrintTipe, MarginTier, KalkulasiStatus, PackingType, ProduktType,
  FinishType, HelmTier, HelmOptions, FilamentEntry, PlateInput,
  KomponenKustomInput, KalkulatorRates, HasilKalkulasi,
} from '@3pb/kalkulator-core'
export { HELM_TIER_DEFAULTS } from '@3pb/kalkulator-core'

import type {
  PlateInput, KomponenKustomInput, HasilKalkulasi, MarginTier,
  PackingType, ProduktType, FinishType,
} from '@3pb/kalkulator-core'

export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
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
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateInput[]
  komponenKustom: KomponenKustomInput[]
  customRiskPct?: number  // override failure rate per job (high-risk jobs)
  produktType?: ProduktType          // default: 'SIMPLE'
  finishType?: FinishType            // only for HELM
  jamSanding?: number
  jamPainting?: number
  jamAssembly?: number
  flatFinishingCost?: number
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
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateData[]
  komponenKustom: KomponenKustomData[]
  produkLinks: KalkulasiProdukData[]
  produktType: ProduktType
  finishType: FinishType
  jamSanding: number
  jamPainting: number
  jamAssembly: number
  flatFinishingCost: number
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
}
