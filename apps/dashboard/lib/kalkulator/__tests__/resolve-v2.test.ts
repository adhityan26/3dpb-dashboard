import { describe, it, expect } from 'vitest'
import { hitungKalkulasi, type KalkulatorRates, type SettingsV2 } from '@3pb/kalkulator-core'
import { buildHasilV2, resolveInputV2 } from '../resolve-v2'
import type { KalkulasiInput } from '../types'

const RATES: KalkulatorRates = {
  fdmHppPerGram: 300, fdmJualPerGram: 900, slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 12, failureSpreadPct: 50, testLayerPct: 5,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
}
const SETTINGS: SettingsV2 = {
  failureSpreadPct: 50, testLayerPct: 5,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
  channels: [
    { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
    { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
  ],
}
const PP = [
  { id: 'p1', nama: 'P1P', mesinPerJam: 4000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: true, isPricingReference: false },
  { id: 'x1', nama: 'X1C', mesinPerJam: 6000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: false, isPricingReference: true },
]
const MP = [
  { id: 'm1', nama: 'PLA', tipe: 'FDM', hppPerGram: 250, jualPerGram: 800, failureRatePct: 8 },
]
const DEPS = { rates: RATES, settings: SETTINGS, printerProfiles: PP, materialProfiles: MP }
const DEPS_NO_PROFILES = { rates: RATES, settings: SETTINGS, printerProfiles: [], materialProfiles: [] }

const legacyInput = (over: Partial<KalkulasiInput> = {}): KalkulasiInput => ({
  nama: 'X', batch: 1, marginTier: 'A',
  packingType: 'S', gantunganType: 'kew_kew', switchQty: 2, hasLabel: true,
  plates: [
    { tipe: 'FDM', gramasi: 21, durasiJam: 1.17 },
    { tipe: 'SLA', gramasi: 5, durasiJam: 0.5 },
  ],
  komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 4 }],
  produktType: 'HELM', finishType: 'FINISHING',
  jamSanding: 1, jamPainting: 1, jamAssembly: 0.5, flatFinishingCost: 10000,
  hargaShopeeAktual: 50000, customRiskPct: 20,
  ...over,
})

describe('PARITAS: input legacy tanpa profil == hitungKalkulasi wrapper', () => {
  it('semua field HasilKalkulasi identik (helm + aksesori lengkap + customRisk)', () => {
    const input = legacyInput()
    const expected = hitungKalkulasi(
      input.plates,
      { packingType: input.packingType, gantunganType: input.gantunganType, switchQty: input.switchQty, hasLabel: input.hasLabel, komponenKustom: input.komponenKustom },
      input.batch, RATES, input.hargaShopeeAktual, input.customRiskPct,
      { finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0.5, flatFinishingCost: 10000, preparerRatePerJam: 35000, finisherRatePerJam: 75000 },
    )
    const actual = buildHasilV2(input, DEPS_NO_PROFILES)
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(actual[k], String(k)).toEqual(expected[k])
    }
  })

  it('paritas juga saat profil ADA tapi input tidak memakainya (tanpa printerProfileId/materialProfileId, tanpa acuan efek ke legacy? — TIDAK: profil acuan hanya berlaku saat plate ber-profil)', () => {
    const input = legacyInput()
    const expected = buildHasilV2(input, DEPS_NO_PROFILES)
    const actual = buildHasilV2(input, DEPS)
    expect(actual.floorPrice).toEqual(expected.floorPrice)
    expect(actual.hppTotal).toEqual(expected.hppTotal)
  })
})

describe('PARITAS: plate multi-material dengan hargaPerGram override', () => {
  it('semua field HasilKalkulasi identik (tanpa helm, tanpa customRisk)', () => {
    const input = legacyInput({
      produktType: 'SIMPLE', finishType: 'RAW',
      packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [],
      customRiskPct: undefined,
      plates: [{
        tipe: 'FDM', durasiJam: 2,
        materials: [
          { brand: 'eSUN', material: 'PLA+', color: 'Red', gramasi: 15, hargaPerGram: 280 },
          { brand: 'Bambu', material: 'TPU', color: 'Clear', gramasi: 5 },
        ],
      }],
    })
    const expected = hitungKalkulasi(
      input.plates,
      { packingType: input.packingType, gantunganType: input.gantunganType, switchQty: input.switchQty, hasLabel: input.hasLabel, komponenKustom: input.komponenKustom },
      input.batch, RATES, input.hargaShopeeAktual, input.customRiskPct,
    )
    const actual = buildHasilV2(input, DEPS_NO_PROFILES)
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(actual[k], String(k)).toEqual(expected[k])
    }
  })
})

describe('PARITAS: hargaPerGram override LEBIH BESAR dari jual base (jual = max(baseJual, override))', () => {
  it('semua field HasilKalkulasi identik (single-material, override 3000 > fdmJualPerGram 900)', () => {
    const input = legacyInput({
      produktType: 'SIMPLE', finishType: 'RAW',
      packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [],
      customRiskPct: undefined,
      plates: [{
        tipe: 'FDM', gramasi: 10, durasiJam: 1, hargaPerGram: 3000,
      }],
    })
    const expected = hitungKalkulasi(
      input.plates,
      { packingType: input.packingType, gantunganType: input.gantunganType, switchQty: input.switchQty, hasLabel: input.hasLabel, komponenKustom: input.komponenKustom },
      input.batch, RATES, input.hargaShopeeAktual, input.customRiskPct,
    )
    const actual = buildHasilV2(input, DEPS_NO_PROFILES)
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(actual[k], String(k)).toEqual(expected[k])
    }
  })
})

describe('resolusi profil', () => {
  it('plate ber-printerProfileId: HPP pakai rate profil, jual pakai rate acuan', () => {
    const input = legacyInput({
      produktType: 'SIMPLE', finishType: 'RAW',
      packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [],
      customRiskPct: undefined,
      plates: [{ tipe: 'FDM', gramasi: 0, durasiJam: 1, printerProfileId: 'p1' }],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].mesinPerJam).toBe(4000)      // aktual = profil p1
    expect(v2.plates[0].mesinPerJamJual).toBe(6000)  // acuan = X1C (isPricingReference)
  })

  it('materialProfileId di material entry → hpp/jual/failure dari profil', () => {
    const input = legacyInput({
      plates: [{ tipe: 'FDM', durasiJam: 1, materials: [{ brand: 'eSUN', material: 'PLA', color: 'Red', gramasi: 10, materialProfileId: 'm1' }] }],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].materials[0]).toMatchObject({ hppPerGram: 250, jualPerGram: 800, failureRatePct: 8 })
  })

  it('override hargaPerGram menang atas material profile (hpp saja, jual tetap profil)', () => {
    const input = legacyInput({
      plates: [{ tipe: 'FDM', durasiJam: 1, materials: [{ brand: 'X', material: 'PLA', color: 'R', gramasi: 10, hargaPerGram: 280, materialProfileId: 'm1' }] }],
    })
    const v2 = resolveInputV2(input, DEPS)
    expect(v2.plates[0].materials[0].hppPerGram).toBe(280)
    expect(v2.plates[0].materials[0].jualPerGram).toBe(800)
  })

  it('input bentuk baru: komponen[] & labor[] menggantikan aksesori/helm', () => {
    const input = legacyInput({
      komponen: [{ nama: 'Packing S', harga: 1500, qty: 1 }],
      labor: [{ nama: 'Sanding', jam: 2, ratePerJam: 35000 }],
    })
    const v2 = resolveInputV2(input, DEPS_NO_PROFILES)
    expect(v2.komponen).toEqual([{ nama: 'Packing S', harga: 1500, qty: 1 }])
    expect(v2.labor).toEqual([{ nama: 'Sanding', jam: 2, ratePerJam: 35000 }])
  })

  it('hargaChannelJson berisi seluruh channel dari settings', () => {
    const out = buildHasilV2(legacyInput(), DEPS_NO_PROFILES)
    const channels = JSON.parse(out.hargaChannelJson)
    expect(channels.map((c: { channelId: string }) => c.channelId)).toEqual(['offline', 'shopee'])
  })
})
