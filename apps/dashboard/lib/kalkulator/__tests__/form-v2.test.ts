import { describe, it, expect } from 'vitest'
import type { KalkulatorRates, SettingsV2 } from '@3pb/kalkulator-core'
import { composeKomponen, splitPackingRow, hitungPerbandinganPrinter } from '../form-v2'
import type { ResolveDeps } from '../resolve-v2'
import type { KalkulasiInput } from '../types'

const packing = { S: 1500, M: 2500, L: 5000, XL: 8000 }

describe('composeKomponen', () => {
  it('packing terpilih jadi item pertama', () => {
    expect(composeKomponen('M', packing, [{ id: '1', nama: 'LED', harga: 5000, qty: 2 }])).toEqual([
      { nama: 'Packing M', harga: 2500, qty: 1 },
      { nama: 'LED', harga: 5000, qty: 2 },
    ])
  })
  it('tanpa packing & baris invalid dibuang (nama kosong / harga 0), qty min 1', () => {
    expect(composeKomponen(undefined, packing, [
      { id: '1', nama: '', harga: 100, qty: 1 },
      { id: '2', nama: 'X', harga: 0, qty: 1 },
      { id: '3', nama: 'Y', harga: 10, qty: 0 },
    ])).toEqual([{ nama: 'Y', harga: 10, qty: 1 }])
  })
})

describe('splitPackingRow', () => {
  it('record lama (kolom packingType terisi) → chip dari kolom, rows utuh', () => {
    const r = splitPackingRow('L', [{ nama: 'Gantungan ring', harga: 800, qty: 1 }])
    expect(r).toEqual({ packingType: 'L', rows: [{ nama: 'Gantungan ring', harga: 800, qty: 1 }] })
  })
  it('record bentuk baru (kolom null) → angkat baris "Packing X"', () => {
    const r = splitPackingRow(null, [{ nama: 'Packing M', harga: 2500, qty: 1 }, { nama: 'LED', harga: 5000, qty: 1 }])
    expect(r).toEqual({ packingType: 'M', rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
  it('tanpa baris packing → undefined', () => {
    expect(splitPackingRow(null, [{ nama: 'LED', harga: 5000, qty: 1 }])).toEqual({ rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
})

describe('hitungPerbandinganPrinter', () => {
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
    { id: 'a1', nama: 'A1', mesinPerJam: 2000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: true, isPricingReference: false },
    { id: 'x1', nama: 'X1C', mesinPerJam: 5000, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: false, isPricingReference: true },
  ]
  const DEPS: ResolveDeps = { rates: RATES, settings: SETTINGS, printerProfiles: PP, materialProfiles: [] }

  const input: KalkulasiInput = {
    nama: 'X', batch: 1, marginTier: 'A',
    switchQty: 0, hasLabel: false, komponenKustom: [],
    plates: [{ tipe: 'FDM', gramasi: 100, durasiJam: 2, printerProfileId: 'a1' }],
  }

  it('margin per printer: harga tetap dari acuan, hpp per mesin', () => {
    const rows = hitungPerbandinganPrinter(input, DEPS, 'A')
    const a1 = rows.find(r => r.nama === 'A1')!, x1c = rows.find(r => r.nama === 'X1C')!
    expect(x1c.isPricingReference).toBe(true)
    expect(a1.hppTotal).toBeLessThan(x1c.hppTotal)
    expect(a1.marginOffline).toBeGreaterThan(x1c.marginOffline)
  })

  it('tanpa profil atau tanpa plate → []', () => {
    expect(hitungPerbandinganPrinter({ ...input, plates: [] }, DEPS, 'A')).toEqual([])
    expect(hitungPerbandinganPrinter(input, { ...DEPS, printerProfiles: [] }, 'A')).toEqual([])
  })
})
