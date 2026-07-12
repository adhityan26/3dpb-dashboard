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
  materialProfileId?: string   // link ke KalkMaterialProfile (metadata; resolusi dilakukan app)
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

// ── V2: printer ──
export interface PrinterProfile {
  id: string
  nama: string
  mesinPerJam: number
}

export interface PrinterCostInput {
  watt: number              // konsumsi rata-rata printer
  tarifPerKwh: number       // tarif listrik Rp/kWh
  hargaPrinter: number      // harga beli printer
  umurPakaiJam: number      // estimasi umur pakai dalam jam print
  maintenancePerJam?: number
}

// ── V2: model settings-driven ──
export interface MaterialProfile {
  id: string
  nama: string             // 'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Resin ABS-like', …
  tipe: PrintTipe
  hppPerGram: number       // harga modal per gram
  jualPerGram: number      // basis floor price per gram
  failureRatePct: number   // failure rate khas material ini
}

export interface KomponenItem { nama: string; harga: number; qty: number }

/** Biaya = (jam × ratePerJam) + flat. Field yang tidak diisi dianggap 0. */
export interface LaborItem {
  nama: string
  jam?: number
  ratePerJam?: number
  flat?: number
}

export interface ChannelDef {
  id: string               // 'offline', 'shopee', 'tokopedia', …
  nama: string
  feeMultiplier: number    // offline = 1; Shopee ≈ 1.2
}

export interface SettingsV2 {
  failureSpreadPct: number
  testLayerPct: number
  marginMultipliers: Record<MarginTier, number>
  resellerBulkMultiplier: number
  channels: ChannelDef[]
}

/** Pemakaian material di satu plate — nilai SUDAH resolved (dari profile/katalog/override). */
export interface MaterialUsageV2 {
  gramasi: number
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
  materialProfileId?: string
}

export interface PlateInputV2 {
  namaPart?: string
  durasiJam: number
  mesinPerJam: number      // resolved dari printer profile
  /** Rate mesin untuk jalur HARGA (floor price) — dari printer profile acuan.
   *  Fallback ke mesinPerJam. HPP & failure cost SELALU pakai mesinPerJam (biaya aktual). */
  mesinPerJamJual?: number
  materials: MaterialUsageV2[]
  printerProfileId?: string
}

export interface KalkulasiInputV2 {
  plates: PlateInputV2[]
  batch: number
  komponen: KomponenItem[]
  labor: LaborItem[]
  customRiskPct?: number   // override failure rate SEMUA material
  hargaAktual?: { channelId: string; harga: number }
}

export interface HargaChannelV2 {
  channelId: string
  A: number
  B: number
  C: number
  margin: number           // margin % pada harga A (net setelah fee) vs hppTotal
}

/** Semua nilai TIDAK dibulatkan. */
export interface HasilKalkulasiV2 {
  hppProduksi: number
  hppKomponen: number
  hppLabor: number
  hppTotal: number
  jualBase: number
  floorPrice: number
  hargaPerChannel: HargaChannelV2[]
  resellerStd: number
  resellerBulk: number
  status: KalkulasiStatus
}
