export type PrintTipe = 'FDM' | 'SLA'
export type MarginTier = 'A' | 'B' | 'C'
export type KalkulasiStatus = 'AMAN' | 'BAWAH_REKM' | 'RUGI' | 'TIDAK_DISET'
export type PackingType = 'S' | 'M' | 'L' | 'XL'

export interface PlateInput {
  namaPart?: string
  tipe: PrintTipe
  gramasi: number
  durasiJam: number
}

export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
}

export interface KomponenKustomInput {
  nama: string
  harga: number
  qty: number
}

export interface KomponenKustomData extends KomponenKustomInput {
  id: string
  kalkulasiId: string
}

export interface KalkulatorRates {
  fdmHppPerGram: number
  fdmJualPerGram: number
  slaHppPerGram: number
  slaJualPerGram: number
  mesinPerJam: number
  adminEcommerce: number
  packing: Record<string, number>
  gantungan: Record<string, number>
  switchPerPcs: number
  labelPerLembar: number
}

export interface HasilKalkulasi {
  hppProduksi: number
  hppKomponen: number
  hppTotal: number
  floorPrice: number
  offlineA: number
  offlineB: number
  offlineC: number
  shopeeA: number
  shopeeB: number
  shopeeC: number
  resellerStd: number
  resellerBulk: number
  marginOfflineA: number
  marginShopeeA: number
  status: KalkulasiStatus
}

export interface KalkulasiInput {
  nama: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateInput[]
  komponenKustom: KomponenKustomInput[]
}

export interface KalkulasiData extends HasilKalkulasi {
  id: string
  nama: string
  createdAt: string
  updatedAt: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateData[]
  komponenKustom: KomponenKustomData[]
  produkLinks: KalkulasiProdukData[]
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
