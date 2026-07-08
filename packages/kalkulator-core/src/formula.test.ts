import { describe, it, expect } from 'vitest'
import { hitungKalkulasi } from './formula'
import type { KalkulatorRates, PlateInput } from './types'

const DEFAULT_RATES: KalkulatorRates = {
  fdmHppPerGram: 300,
  fdmJualPerGram: 900,
  slaHppPerGram: 1750,
  slaJualPerGram: 3500,
  mesinPerJam: 4000,
  adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500,
  labelPerLembar: 750,
  failureRatePct: 0,
  failureSpreadPct: 50,
  testLayerPct: 0,
  preparerRatePerJam: 35000,
  finisherRatePerJam: 75000,
  helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
}

describe('hitungKalkulasi', () => {
  it('calculates HPP correctly for FDM single batch', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppProduksi).toBeCloseTo(10980, 0)
    expect(result.hppKomponen).toBe(0)
    expect(result.hppTotal).toBeCloseTo(10980, 0)
  })

  it('calculates floor price correctly with accessories', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppKomponen).toBe(2400)
    expect(result.floorPrice).toBeCloseTo(25980, 0)
  })

  it('divides correctly by batch', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 210, durasiJam: 11.7 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      10, DEFAULT_RATES
    )
    expect(result.hppProduksi).toBeCloseTo(10980, 0)
  })

  it('calculates SLA HPP correctly', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'SLA', gramasi: 5, durasiJam: 0.5 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppProduksi).toBeCloseTo(10750, 0)
    expect(result.floorPrice).toBeCloseTo(19500, 0)
  })

  it('calculates mixed FDM+SLA correctly', () => {
    const result = hitungKalkulasi(
      [
        { tipe: 'FDM', gramasi: 18, durasiJam: 1.0 },
        { tipe: 'SLA', gramasi: 2, durasiJam: 0.25 },
      ],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppProduksi).toBeCloseTo(13900, 0)
  })

  it('SLA plate with materials[] falls back to SLA rates, not FDM', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'SLA', durasiJam: 0.5, materials: [{ brand: 'AnyCubic', material: 'ABS-like', color: 'Grey', gramasi: 5 }] }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    // matHpp = 5 × 1750 = 8750; mesin = 0.5 × 4000 = 2000 → 10750
    expect(result.hppProduksi).toBeCloseTo(10750, 0)
    // matJual = 5 × 3500 = 17500; + mesin 2000 → 19500
    expect(result.floorPrice).toBeCloseTo(19500, 0)
  })

  it('calculates switch qty correctly', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 25, durasiJam: 1.0 }],
      { packingType: 'S', gantunganType: undefined, switchQty: 3, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppKomponen).toBe(9000)
  })

  it('returns AMAN when shopee price >= shopeeA', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 50000
    )
    expect(result.status).toBe('AMAN')
  })

  it('returns RUGI when shopee price < floorPrice', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, 10000
    )
    expect(result.status).toBe('RUGI')
  })

  it('calculates margins as percentages > 0', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.marginOfflineA).toBeGreaterThan(0)
    expect(result.marginShopeeA).toBeGreaterThan(0)
  })

  it('failure buffer tetap kena biaya mesin saat total gramasi 0 (paritas legacy)', () => {
    const rates = { ...DEFAULT_RATES, failureRatePct: 12 }
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 0, durasiJam: 1 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, rates
    )
    // mesin = 4000; failureCost = 4000 × 0.12 = 480; spread 50% → HPP kena 240
    expect(result.hppProduksi).toBeCloseTo(4240, 0)
  })
})

describe('hitungKalkulasi — helm finishing', () => {
  it('SIMPLE product: hppFinishing = 0', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    expect(result.hppFinishing).toBe(0)
  })

  it('HELM RAW: hppFinishing = 0', () => {
    const helmRaw: import('./types').HelmOptions = {
      finishType: 'RAW',
      jamSanding: 2.5, jamPainting: 2.0, jamAssembly: 0.75,
      flatFinishingCost: 55000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, undefined, undefined, helmRaw
    )
    expect(result.hppFinishing).toBe(0)
  })

  it('HELM FINISHING: hppFinishing = labor + consumables', () => {
    // (1 + 0) * 35000 + 1 * 75000 + 10000 = 120000
    const helmFin: import('./types').HelmOptions = {
      finishType: 'FINISHING',
      jamSanding: 1, jamPainting: 1, jamAssembly: 0,
      flatFinishingCost: 10000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, undefined, undefined, helmFin
    )
    expect(result.hppFinishing).toBe(120000)
  })

  it('HELM FINISHING: hppTotal includes hppFinishing', () => {
    const base = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES
    )
    const helmFin: import('./types').HelmOptions = {
      finishType: 'FINISHING',
      jamSanding: 1, jamPainting: 1, jamAssembly: 0,
      flatFinishingCost: 10000,
      preparerRatePerJam: 35000,
      finisherRatePerJam: 75000,
    }
    const withHelm = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1, DEFAULT_RATES, undefined, undefined, helmFin
    )
    expect(withHelm.hppTotal).toBe(base.hppTotal + 120000)
    expect(withHelm.floorPrice).toBeGreaterThan(base.floorPrice)
  })
})
