import { hitungKalkulasiV2 } from './formula-v2'
import type { SettingsV2, KalkulasiInputV2 } from './types'

const SETTINGS: SettingsV2 = {
  failureSpreadPct: 50,
  testLayerPct: 0,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
  channels: [
    { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
    { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
  ],
}

function baseInput(over: Partial<KalkulasiInputV2> = {}): KalkulasiInputV2 {
  return {
    plates: [{
      durasiJam: 1,
      mesinPerJam: 1000,
      materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
    ...over,
  }
}

describe('hitungKalkulasiV2', () => {
  it('single material tanpa failure: hpp & floor dasar', () => {
    const r = hitungKalkulasiV2(baseInput(), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(4000)   // 10×300 + 1000
    expect(r.floorPrice).toBeCloseTo(10000)   // 10×900 + 1000
  })

  it('failure rate = weighted average berdasarkan gramasi', () => {
    const r = hitungKalkulasiV2(baseInput({
      plates: [{
        durasiJam: 2, mesinPerJam: 4000,
        materials: [
          { gramasi: 80, hppPerGram: 300, jualPerGram: 900, failureRatePct: 10 },
          { gramasi: 20, hppPerGram: 500, jualPerGram: 1200, failureRatePct: 30 },
        ],
      }],
    }), SETTINGS)
    // matHpp = 24000 + 10000 = 34000; mesin = 8000
    // weighted failure = (80×10 + 20×30)/100 = 14% → failureCost = 42000 × 0.14 = 5880
    // spread 50 → HPP kena 2940
    expect(r.hppProduksi).toBeCloseTo(34000 + 8000 + 2940)
  })

  it('customRiskPct override semua failure rate material', () => {
    const r = hitungKalkulasiV2(baseInput({
      customRiskPct: 20,
      plates: [{
        durasiJam: 1, mesinPerJam: 1000,
        materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 5 }],
      }],
    }), SETTINGS)
    // failureCost = 4000 × 0.20 = 800 → HPP kena 400
    expect(r.hppProduksi).toBeCloseTo(4400)
  })

  it('komponen & labor dijumlahkan ke hpp dan floor', () => {
    const r = hitungKalkulasiV2(baseInput({
      komponen: [{ nama: 'Packing', harga: 1500, qty: 1 }, { nama: 'Magnet', harga: 500, qty: 4 }],
      labor: [
        { nama: 'Sanding', jam: 1.5, ratePerJam: 35000 },
        { nama: 'Consumables', flat: 10000 },
      ],
    }), SETTINGS)
    expect(r.hppKomponen).toBeCloseTo(3500)
    expect(r.hppLabor).toBeCloseTo(62500)
    expect(r.hppTotal).toBeCloseTo(4000 + 3500 + 62500)
    expect(r.floorPrice).toBeCloseTo(10000 + 3500 + 62500)
  })

  it('harga per channel = floor × margin × fee; margin dihitung dari net', () => {
    const r = hitungKalkulasiV2(baseInput(), SETTINGS)
    const offline = r.hargaPerChannel.find(c => c.channelId === 'offline')!
    const shopee = r.hargaPerChannel.find(c => c.channelId === 'shopee')!
    expect(offline.A).toBeCloseTo(11000)
    expect(offline.C).toBeCloseTo(20000)
    expect(shopee.A).toBeCloseTo(13200)
    // net Shopee A = 13200/1.2 = 11000; margin = (11000−4000)/11000
    expect(shopee.margin).toBeCloseTo(((11000 - 4000) / 11000) * 100)
    expect(r.resellerStd).toBeCloseTo(11000)
    expect(r.resellerBulk).toBeCloseTo(10500)
  })

  it('batch membagi biaya produksi', () => {
    const r = hitungKalkulasiV2(baseInput({
      batch: 10,
      plates: [{
        durasiJam: 10, mesinPerJam: 1000,
        materials: [{ gramasi: 100, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }],
      }],
    }), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(4000)
  })

  it('status per channel: AMAN / BAWAH_REKM / RUGI / TIDAK_DISET', () => {
    expect(hitungKalkulasiV2(baseInput(), SETTINGS).status).toBe('TIDAK_DISET')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 13200 } }), SETTINGS).status).toBe('AMAN')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 10000 } }), SETTINGS).status).toBe('BAWAH_REKM')
    expect(hitungKalkulasiV2(baseInput({ hargaAktual: { channelId: 'shopee', harga: 9999 } }), SETTINGS).status).toBe('RUGI')
  })

  it('gramasi total 0 tidak menghasilkan NaN', () => {
    const r = hitungKalkulasiV2(baseInput({
      plates: [{ durasiJam: 1, mesinPerJam: 1000, materials: [] }],
    }), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(1000)
    expect(Number.isNaN(r.hppTotal)).toBe(false)
  })
})
