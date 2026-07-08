import type {
  PlateInput, KalkulasiStatus, KalkulatorRates, HasilKalkulasi, MarginTier, HelmOptions
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
  hargaShopeeAktual?: number,
  customRiskPct?: number,
  helmOptions?: HelmOptions,
): HasilKalkulasi {
  const safeBatch = Math.max(1, batch)
  const failureRate = (customRiskPct ?? rates.failureRatePct) / 100
  const spread = rates.failureSpreadPct / 100          // 0=owner, 1=customer
  const testPct = rates.testLayerPct / 100

  // Calculate HPP and jual cost for one plate
  // HPP  = actual cost (katalog rate, fallback ke base config) + failure buffer (owner portion) + test layer
  // Jual = floor price basis (MAX(base config, katalog)) + failure buffer (customer portion)
  function plateCost(p: PlateInput): { hpp: number; jual: number } {
    const mesin = p.durasiJam * rates.mesinPerJam

    let baseHpp: number, baseJual: number, matHpp: number, matJual: number

    if (p.materials && p.materials.length > 0) {
      const { totalHpp, totalJual } = p.materials.reduce((s, m) => {
        const hppRate  = m.hargaPerGram ?? rates.fdmHppPerGram
        const jualRate = Math.max(rates.fdmJualPerGram, m.hargaPerGram ?? rates.fdmJualPerGram)
        return { totalHpp: s.totalHpp + m.gramasi * hppRate, totalJual: s.totalJual + m.gramasi * jualRate }
      }, { totalHpp: 0, totalJual: 0 })
      matHpp = totalHpp; matJual = totalJual
    } else {
      const isSLA = p.tipe === 'SLA'
      baseHpp  = isSLA ? rates.slaHppPerGram  : rates.fdmHppPerGram
      baseJual = isSLA ? rates.slaJualPerGram : rates.fdmJualPerGram
      const hppRate  = p.hargaPerGram ?? baseHpp
      const jualRate = Math.max(baseJual, p.hargaPerGram ?? baseJual)
      matHpp = (p.gramasi ?? 0) * hppRate
      matJual = (p.gramasi ?? 0) * jualRate
    }

    // Failure cost — base = hppRate (real cost)
    const failureCost = (matHpp + mesin) * failureRate
    // Test layer cost — HPP only (owner's QC cost), material only
    const testCost = matHpp * testPct

    const hpp  = matHpp  + mesin + failureCost * (1 - spread) + testCost
    const jual = matJual + mesin + failureCost * spread

    return { hpp, jual }
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

  // Helm finishing: labor (preparer + finisher) + flat consumables
  const hppFinishing = (helmOptions?.finishType === 'FINISHING')
    ? Math.round(
        (helmOptions.jamSanding + helmOptions.jamAssembly) * helmOptions.preparerRatePerJam
        + helmOptions.jamPainting * helmOptions.finisherRatePerJam
        + helmOptions.flatFinishingCost
      )
    : 0

  const hppTotalWithFinishing = hppTotal + hppFinishing
  const floorPriceWithFinishing = floorPrice + hppFinishing

  const offlineA = floorPriceWithFinishing * MARGIN_MULTIPLIERS.A
  const offlineB = floorPriceWithFinishing * MARGIN_MULTIPLIERS.B
  const offlineC = floorPriceWithFinishing * MARGIN_MULTIPLIERS.C
  const shopeeA = offlineA * rates.adminEcommerce
  const shopeeB = offlineB * rates.adminEcommerce
  const shopeeC = offlineC * rates.adminEcommerce
  const resellerStd = offlineA
  const resellerBulk = floorPriceWithFinishing * 1.05

  const marginOfflineA = offlineA > 0 ? ((offlineA - hppTotalWithFinishing) / offlineA) * 100 : 0
  const netShopeeA = shopeeA / rates.adminEcommerce
  const marginShopeeA = netShopeeA > 0 ? ((netShopeeA - hppTotalWithFinishing) / netShopeeA) * 100 : 0

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPriceWithFinishing) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  return {
    hppProduksi:    Math.round(hppProduksi),
    hppKomponen:    Math.round(hppKomponen),
    hppFinishing,                                // already Math.round'd above
    hppTotal:       Math.round(hppTotalWithFinishing),
    floorPrice:     Math.round(floorPriceWithFinishing),
    offlineA:  Math.round(offlineA),
    offlineB:  Math.round(offlineB),
    offlineC:  Math.round(offlineC),
    shopeeA:   Math.round(shopeeA),
    shopeeB:   Math.round(shopeeB),
    shopeeC:   Math.round(shopeeC),
    resellerStd:   Math.round(resellerStd),
    resellerBulk:  Math.round(resellerBulk),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA:  Math.round(marginShopeeA * 10) / 10,
    status,
  }
}
