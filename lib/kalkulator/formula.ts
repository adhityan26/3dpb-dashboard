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

  // Calculate HPP and jual cost for one plate
  // HPP  = actual cost (katalog rate, fallback ke base config)
  // Jual = floor price basis (MAX(base config, katalog) — tidak pernah di bawah base)
  function plateCost(p: PlateInput): { hpp: number; jual: number } {
    const mesin = p.durasiJam * rates.mesinPerJam
    if (p.materials && p.materials.length > 0) {
      // Multi-material: each entry has its own hpp/jual cost
      const { totalHpp, totalJual } = p.materials.reduce((s, m) => {
        const hppRate  = m.hargaPerGram ?? rates.fdmHppPerGram
        const jualRate = Math.max(rates.fdmJualPerGram, m.hargaPerGram ?? rates.fdmJualPerGram)
        return {
          totalHpp:  s.totalHpp  + m.gramasi * hppRate,
          totalJual: s.totalJual + m.gramasi * jualRate,
        }
      }, { totalHpp: 0, totalJual: 0 })
      return { hpp: totalHpp + mesin, jual: totalJual + mesin }
    }
    // Single-material (legacy)
    const g = p.gramasi ?? 0
    const isSLA = p.tipe === 'SLA'
    const baseHpp  = isSLA ? rates.slaHppPerGram  : rates.fdmHppPerGram
    const baseJual = isSLA ? rates.slaJualPerGram : rates.fdmJualPerGram
    const hppRate  = p.hargaPerGram ?? baseHpp
    const jualRate = Math.max(baseJual, p.hargaPerGram ?? baseJual)
    return {
      hpp:  g * hppRate  + mesin,
      jual: g * jualRate + mesin,
    }
  }

  const totalHppBatch  = plates.reduce((s, p) => s + plateCost(p).hpp,  0)
  const totalJualBatch = plates.reduce((s, p) => s + plateCost(p).jual, 0)
  const hppProduksi = totalHppBatch  / safeBatch
  const jualBase    = totalJualBatch / safeBatch

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
  const netShopeeA = shopeeA / rates.adminEcommerce
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
