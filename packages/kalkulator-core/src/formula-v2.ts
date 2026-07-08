import type {
  KalkulasiInputV2, SettingsV2, HasilKalkulasiV2, PlateInputV2,
  KalkulasiStatus, HargaChannelV2,
} from './types'

/**
 * Formula HPP v2 — settings-driven, tanpa pembulatan.
 * Konsep inti sama dengan legacy: dua jalur harga material (modal vs jual),
 * failure cost dibelah spread (owner vs customer), test layer material-only.
 */
export function hitungKalkulasiV2(input: KalkulasiInputV2, settings: SettingsV2): HasilKalkulasiV2 {
  const safeBatch = Math.max(1, input.batch)
  const spread = settings.failureSpreadPct / 100
  const testPct = settings.testLayerPct / 100

  function plateCost(p: PlateInputV2): { hpp: number; jual: number } {
    const mesin = p.durasiJam * p.mesinPerJam
    let matHpp = 0, matJual = 0, gramTotal = 0, failWeighted = 0
    for (const m of p.materials) {
      matHpp += m.gramasi * m.hppPerGram
      matJual += m.gramasi * Math.max(m.jualPerGram, m.hppPerGram)
      gramTotal += m.gramasi
      failWeighted += m.gramasi * m.failureRatePct
    }
    const failureRatePct = input.customRiskPct ?? (gramTotal > 0 ? failWeighted / gramTotal : 0)
    const failureCost = (matHpp + mesin) * (failureRatePct / 100)
    const testCost = matHpp * testPct
    return {
      hpp:  matHpp  + mesin + failureCost * (1 - spread) + testCost,
      jual: matJual + mesin + failureCost * spread,
    }
  }

  let hppBatch = 0, jualBatch = 0
  for (const p of input.plates) {
    const c = plateCost(p)
    hppBatch += c.hpp
    jualBatch += c.jual
  }
  const hppProduksi = hppBatch / safeBatch
  const jualBase = jualBatch / safeBatch

  const hppKomponen = input.komponen.reduce((s, k) => s + k.harga * k.qty, 0)
  const hppLabor = input.labor.reduce((s, l) => s + (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0), 0)

  const hppTotal = hppProduksi + hppKomponen + hppLabor
  const floorPrice = jualBase + hppKomponen + hppLabor

  const m = settings.marginMultipliers
  const hargaPerChannel: HargaChannelV2[] = settings.channels.map(ch => {
    const A = floorPrice * m.A * ch.feeMultiplier
    const net = ch.feeMultiplier > 0 ? A / ch.feeMultiplier : 0
    return {
      channelId: ch.id,
      A,
      B: floorPrice * m.B * ch.feeMultiplier,
      C: floorPrice * m.C * ch.feeMultiplier,
      margin: net > 0 ? ((net - hppTotal) / net) * 100 : 0,
    }
  })

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (input.hargaAktual) {
    const ch = hargaPerChannel.find(c => c.channelId === input.hargaAktual!.channelId)
    if (ch) {
      if (input.hargaAktual.harga >= ch.A) status = 'AMAN'
      else if (input.hargaAktual.harga >= floorPrice) status = 'BAWAH_REKM'
      else status = 'RUGI'
    }
  }

  return {
    hppProduksi, hppKomponen, hppLabor, hppTotal, jualBase, floorPrice,
    hargaPerChannel,
    resellerStd: floorPrice * m.A,
    resellerBulk: floorPrice * settings.resellerBulkMultiplier,
    status,
  }
}
