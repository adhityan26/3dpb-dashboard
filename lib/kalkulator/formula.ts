import type {
  PlateInput, KalkulasiStatus, KalkulatorRates, HasilKalkulasi, MarginTier
} from './types'

interface AksesoriInput {
  packingType?: string
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  komponenKustom: { harga: number; qty: number }[]
}

const MARGIN_MULTIPLIERS: Record<MarginTier, number> = { A: 1.1, B: 1.5, C: 2.0 }

export function hitungKalkulasi(
  plates: PlateInput[],
  aksesori: AksesoriInput,
  batch: number,
  rates: KalkulatorRates,
  marginTier: MarginTier,
  hargaShopeeAktual?: number
): HasilKalkulasi {
  const safeBatch = Math.max(1, batch)

  const totalHppBatch = plates.reduce((sum, p) => {
    const hppRate = p.tipe === 'SLA' ? rates.slaHppPerGram : rates.fdmHppPerGram
    return sum + p.gramasi * hppRate + p.durasiJam * rates.mesinPerJam
  }, 0)
  const hppProduksi = totalHppBatch / safeBatch

  const totalJualBatch = plates.reduce((sum, p) => {
    const jualRate = p.tipe === 'SLA' ? rates.slaJualPerGram : rates.fdmJualPerGram
    return sum + p.gramasi * jualRate + p.durasiJam * rates.mesinPerJam
  }, 0)
  const jualBase = totalJualBatch / safeBatch

  const hppKomponen =
    (aksesori.packingType ? (rates.packing[aksesori.packingType] ?? 0) : 0) +
    (aksesori.gantunganType ? (rates.gantungan[aksesori.gantunganType] ?? 0) : 0) +
    aksesori.switchQty * rates.switchPerPcs +
    (aksesori.hasLabel ? rates.labelPerLembar : 0) +
    aksesori.komponenKustom.reduce((s, k) => s + k.harga * k.qty, 0)

  const hppTotal = hppProduksi + hppKomponen
  const floorPrice = jualBase + hppKomponen

  const offlineA = floorPrice * MARGIN_MULTIPLIERS.A
  const offlineB = floorPrice * MARGIN_MULTIPLIERS.B
  const offlineC = floorPrice * MARGIN_MULTIPLIERS.C
  const shopeeA = offlineA * rates.adminEcommerce
  const shopeeB = offlineB * rates.adminEcommerce
  const shopeeC = offlineC * rates.adminEcommerce
  const resellerStd = offlineA
  const resellerBulk = floorPrice * 1.05

  const marginOfflineA = offlineA > 0 ? ((offlineA - hppTotal) / offlineA) * 100 : 0
  const netShopeeA = shopeeA * 0.8
  const marginShopeeA = netShopeeA > 0 ? ((netShopeeA - hppTotal) / netShopeeA) * 100 : 0

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPrice) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  return {
    hppProduksi: Math.round(hppProduksi),
    hppKomponen: Math.round(hppKomponen),
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA),
    offlineB: Math.round(offlineB),
    offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA),
    shopeeB: Math.round(shopeeB),
    shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(resellerStd),
    resellerBulk: Math.round(resellerBulk),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
  }
}
