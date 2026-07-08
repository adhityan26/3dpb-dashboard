import type {
  PlateInput, PlateInputV2, MaterialUsageV2, KalkulatorRates, HelmOptions,
  KomponenItem, LaborItem, SettingsV2,
} from './types'

export interface LegacyAksesori {
  packingType?: string
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  komponenKustom: { nama?: string; harga: number; qty: number }[]
}

export function legacyPlateToV2(p: PlateInput, rates: KalkulatorRates): PlateInputV2 {
  const isSLA = p.tipe === 'SLA'
  const baseHpp = isSLA ? rates.slaHppPerGram : rates.fdmHppPerGram
  const baseJual = isSLA ? rates.slaJualPerGram : rates.fdmJualPerGram
  const toUsage = (gramasi: number, override?: number): MaterialUsageV2 => ({
    gramasi,
    hppPerGram: override ?? baseHpp,
    jualPerGram: Math.max(baseJual, override ?? baseJual),
    failureRatePct: rates.failureRatePct,
  })
  const materials = (p.materials && p.materials.length > 0)
    ? p.materials.map(m => toUsage(m.gramasi, m.hargaPerGram))
    : [toUsage(p.gramasi ?? 0, p.hargaPerGram)]
  return { namaPart: p.namaPart, durasiJam: p.durasiJam, mesinPerJam: rates.mesinPerJam, materials }
}

export function legacyKomponenToV2(aksesori: LegacyAksesori, rates: KalkulatorRates): KomponenItem[] {
  const items: KomponenItem[] = []
  if (aksesori.packingType && rates.packing[aksesori.packingType] !== undefined) {
    items.push({ nama: `Packing ${aksesori.packingType}`, harga: rates.packing[aksesori.packingType], qty: 1 })
  }
  if (aksesori.gantunganType && rates.gantungan[aksesori.gantunganType] !== undefined) {
    items.push({ nama: `Gantungan ${aksesori.gantunganType}`, harga: rates.gantungan[aksesori.gantunganType], qty: 1 })
  }
  if (aksesori.switchQty > 0) {
    items.push({ nama: 'Switch', harga: rates.switchPerPcs, qty: aksesori.switchQty })
  }
  if (aksesori.hasLabel) {
    items.push({ nama: 'Label', harga: rates.labelPerLembar, qty: 1 })
  }
  for (const k of aksesori.komponenKustom) {
    items.push({ nama: k.nama ?? 'Komponen', harga: k.harga, qty: k.qty })
  }
  return items
}

export function helmToLabor(helm?: HelmOptions): LaborItem[] {
  if (!helm || helm.finishType !== 'FINISHING') return []
  return [
    { nama: 'Preparer (sanding + assembly)', jam: helm.jamSanding + helm.jamAssembly, ratePerJam: helm.preparerRatePerJam },
    { nama: 'Finisher (painting)', jam: helm.jamPainting, ratePerJam: helm.finisherRatePerJam },
    { nama: 'Consumables finishing', flat: helm.flatFinishingCost },
  ]
}

export function legacySettingsToV2(rates: KalkulatorRates): SettingsV2 {
  return {
    failureSpreadPct: rates.failureSpreadPct,
    testLayerPct: rates.testLayerPct,
    marginMultipliers: rates.marginMultipliers,
    resellerBulkMultiplier: rates.resellerBulkMultiplier,
    channels: [
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: rates.adminEcommerce },
    ],
  }
}
