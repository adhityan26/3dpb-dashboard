export type PrintTipe = 'FDM' | 'SLA'
export type MarginTier = 'A' | 'B' | 'C'
export type KalkulasiStatus = 'AMAN' | 'BAWAH_REKM' | 'RUGI' | 'TIDAK_DISET'
export type PackingType = 'S' | 'M' | 'L' | 'XL'
export type ProduktType = 'SIMPLE' | 'HELM'
export type FinishType = 'RAW' | 'FINISHING'
export type HelmTier = 'MINIMAL' | 'LIGHT' | 'MEDIUM' | 'HEAVY'

export interface HelmOptions {
  finishType: FinishType
  jamSanding: number
  jamPainting: number
  jamAssembly: number
  flatFinishingCost: number
  preparerRatePerJam: number
  finisherRatePerJam: number
}

export const HELM_TIER_DEFAULTS: Record<HelmTier, { jamSanding: number; jamPainting: number; jamAssembly: number }> = {
  MINIMAL: { jamSanding: 0.5, jamPainting: 0.5, jamAssembly: 0.25 },
  LIGHT: { jamSanding: 1.5, jamPainting: 1.0, jamAssembly: 0.50 },
  MEDIUM: { jamSanding: 2.5, jamPainting: 2.0, jamAssembly: 0.75 },
  HEAVY: { jamSanding: 4.0, jamPainting: 3.5, jamAssembly: 1.00 },
}

/** One filament entry in a multi-material plate */
export interface FilamentEntry {
  brand: string            // e.g. "Bambu", "eSUN"
  material: string         // e.g. "PLA+", "TPU"
  color: string            // e.g. "Red", "Beige"
  gramasi: number
  isSupport?: boolean      // true = support material
  hargaPerGram?: number    // override cost, else use FilamentHarga catalog or default rate
  filamentId?: string      // optional link to FilamentHarga catalog
}

export interface PlateInput {
  namaPart?: string
  tipe?: PrintTipe          // legacy single-material
  printer?: string
  gramasi?: number          // legacy single-material gramasi
  materials?: FilamentEntry[] // multi-material (replaces tipe+gramasi when set)
  durasiJam: number
  filamentHargaId?: string  // link to FilamentHarga (single-material override)
  hargaPerGram?: number     // cached rate from FilamentHarga
}

export interface KomponenKustomInput {
  nama: string
  harga: number
  qty: number
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
  failureRatePct: number   // % kemungkinan print gagal, default 12
  failureSpreadPct: number // % failure cost yang dibebankan ke floor price (0=owner tanggung, 100=customer tanggung), default 50
  testLayerPct: number     // % gramasi terbuang untuk prototype/test layers, default 5
  // Helm / Topeng rates
  preparerRatePerJam: number      // Rp/jam untuk sanding + assembly, default 35000
  finisherRatePerJam: number      // Rp/jam untuk painting, default 75000
  helmConsumablesDefault: number  // default flat consumables per topeng, default 55000
  marginMultipliers: Record<MarginTier, number>  // default { A: 1.1, B: 1.5, C: 2.0 }
  resellerBulkMultiplier: number                 // default 1.05
}

export interface HasilKalkulasi {
  hppProduksi: number
  hppKomponen: number
  hppFinishing: number
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
