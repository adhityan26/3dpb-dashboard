import { legacyKomponenToV2, helmToLabor, legacySettingsToV2 } from './adapter'
import type { KalkulatorRates, HelmOptions } from './types'

const RATES: KalkulatorRates = {
  fdmHppPerGram: 300, fdmJualPerGram: 900,
  slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 12, failureSpreadPct: 50, testLayerPct: 5,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
}

describe('legacyKomponenToV2', () => {
  it('memetakan packing/gantungan/switch/label/kustom jadi KomponenItem', () => {
    const items = legacyKomponenToV2({
      packingType: 'S', gantunganType: 'kew_kew', switchQty: 3, hasLabel: true,
      komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 4 }],
    }, RATES)
    const total = items.reduce((s, k) => s + k.harga * k.qty, 0)
    expect(total).toBe(1500 + 900 + 3 * 2500 + 750 + 2000)
  })

  it('tipe packing/gantungan tak dikenal → dilewati (perilaku legacy ?? 0)', () => {
    const items = legacyKomponenToV2({
      packingType: 'XXL', gantunganType: 'unknown', switchQty: 0, hasLabel: false, komponenKustom: [],
    }, RATES)
    expect(items).toHaveLength(0)
  })
})

describe('helmToLabor', () => {
  it('RAW / undefined → tanpa labor', () => {
    expect(helmToLabor(undefined)).toHaveLength(0)
    const raw: HelmOptions = { finishType: 'RAW', jamSanding: 2, jamPainting: 2, jamAssembly: 1, flatFinishingCost: 55000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 }
    expect(helmToLabor(raw)).toHaveLength(0)
  })

  it('FINISHING → preparer + finisher + consumables (total = perilaku legacy)', () => {
    const fin: HelmOptions = { finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0, flatFinishingCost: 10000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 }
    const labor = helmToLabor(fin)
    const total = labor.reduce((s, l) => s + (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0), 0)
    expect(total).toBe(120000)
  })
})

describe('legacySettingsToV2', () => {
  it('channel offline (fee 1) + shopee (fee adminEcommerce)', () => {
    const s = legacySettingsToV2(RATES)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
    ])
    expect(s.marginMultipliers).toEqual({ A: 1.1, B: 1.5, C: 2.0 })
  })
})
