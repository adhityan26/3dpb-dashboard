import type {
  PlateInput, KalkulatorRates, HasilKalkulasi, HelmOptions, KalkulasiStatus,
} from './types'
import { hitungKalkulasiV2 } from './formula-v2'
import {
  legacyPlateToV2, legacyKomponenToV2, helmToLabor, legacySettingsToV2,
  type LegacyAksesori,
} from './adapter'

/**
 * API legacy — delegasi ke hitungKalkulasiV2 lewat adapter, lalu presenter
 * mereproduksi pembulatan lama persis (hppFinishing dibulatkan SEBELUM
 * dijumlahkan, sesuai perilaku sebelum refactor).
 */
export function hitungKalkulasi(
  plates: PlateInput[],
  aksesori: LegacyAksesori,
  batch: number,
  rates: KalkulatorRates,
  hargaShopeeAktual?: number,
  customRiskPct?: number,
  helmOptions?: HelmOptions,
): HasilKalkulasi {
  const v2 = hitungKalkulasiV2({
    plates: plates.map(p => legacyPlateToV2(p, rates)),
    batch,
    komponen: legacyKomponenToV2(aksesori, rates),
    labor: helmToLabor(helmOptions),
    // Paritas legacy: failure rate selalu konstan (customRiskPct ?? rates),
    // sehingga buffer tetap kena biaya mesin meski total gramasi 0.
    customRiskPct: customRiskPct ?? rates.failureRatePct,
  }, legacySettingsToV2(rates))

  const hppFinishing = Math.round(v2.hppLabor)
  const hppTotal = v2.hppProduksi + v2.hppKomponen + hppFinishing
  const floorPrice = v2.jualBase + v2.hppKomponen + hppFinishing

  const m = rates.marginMultipliers
  const offlineA = floorPrice * m.A
  const offlineB = floorPrice * m.B
  const offlineC = floorPrice * m.C
  const shopeeA = offlineA * rates.adminEcommerce
  const shopeeB = offlineB * rates.adminEcommerce
  const shopeeC = offlineC * rates.adminEcommerce

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
    hppProduksi: Math.round(v2.hppProduksi),
    hppKomponen: Math.round(v2.hppKomponen),
    hppFinishing,
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA),
    offlineB: Math.round(offlineB),
    offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA),
    shopeeB: Math.round(shopeeB),
    shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(offlineA),
    resellerBulk: Math.round(floorPrice * rates.resellerBulkMultiplier),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
  }
}
