import {
  hitungKalkulasiV2,
  type KalkulatorRates, type SettingsV2, type KalkulasiInputV2, type HasilKalkulasiV2,
  type HasilKalkulasi, type KalkulasiStatus, type MaterialUsageV2, type PlateInputV2,
  type FilamentEntry,
} from '@3pb/kalkulator-core'
import type { KalkulasiInput, PlateInputApp } from './types'
import type { PrinterProfileData, MaterialProfileData } from './profiles-service'

export interface ResolveDeps {
  rates: KalkulatorRates
  settings: SettingsV2
  printerProfiles: PrinterProfileData[]
  materialProfiles: MaterialProfileData[]
}

/** Resolusi satu material entry → MaterialUsageV2.
 *  Prioritas hpp: override hargaPerGram → material profile → rate legacy per tipe.
 *  Jual & failure: material profile → rate legacy (jual di-max dengan override oleh formula core). */
function resolveMaterial(
  entry: Pick<FilamentEntry, 'gramasi' | 'hargaPerGram' | 'materialProfileId'>,
  tipe: 'FDM' | 'SLA',
  deps: ResolveDeps,
): MaterialUsageV2 {
  const profile = entry.materialProfileId
    ? deps.materialProfiles.find(m => m.id === entry.materialProfileId)
    : undefined
  const baseHpp = tipe === 'SLA' ? deps.rates.slaHppPerGram : deps.rates.fdmHppPerGram
  const baseJual = tipe === 'SLA' ? deps.rates.slaJualPerGram : deps.rates.fdmJualPerGram
  const hppPerGram = entry.hargaPerGram ?? profile?.hppPerGram ?? baseHpp
  // Paritas legacy: tanpa profil, jual = max(baseJual, override ?? baseJual)
  const jualPerGram = profile?.jualPerGram ?? Math.max(baseJual, entry.hargaPerGram ?? baseJual)
  const failureRatePct = profile?.failureRatePct ?? deps.rates.failureRatePct
  return { gramasi: entry.gramasi, hppPerGram, jualPerGram, failureRatePct, materialProfileId: entry.materialProfileId }
}

function resolvePlate(p: PlateInputApp, deps: ResolveDeps): PlateInputV2 & { printerProfileId?: string } {
  const tipe = (p.tipe === 'SLA' ? 'SLA' : 'FDM') as 'FDM' | 'SLA'
  const aktual = p.printerProfileId
    ? deps.printerProfiles.find(pp => pp.id === p.printerProfileId)
    : undefined
  const mesinPerJam = aktual?.mesinPerJam ?? deps.rates.mesinPerJam
  // Mesin acuan harga hanya berlaku saat plate memakai printer profile —
  // jalur legacy murni (tanpa profil) harus paritas dengan perilaku lama.
  const acuan = aktual
    ? (deps.printerProfiles.find(pp => pp.isPricingReference) ?? aktual)
    : undefined
  const materials = (p.materials && p.materials.length > 0)
    ? p.materials.map(m => resolveMaterial(m, tipe, deps))
    : [resolveMaterial({ gramasi: p.gramasi ?? 0, hargaPerGram: p.hargaPerGram, materialProfileId: p.materialProfileId }, tipe, deps)]
  return {
    namaPart: p.namaPart,
    durasiJam: p.durasiJam,
    mesinPerJam,
    mesinPerJamJual: acuan?.mesinPerJam,
    materials,
    printerProfileId: p.printerProfileId,
  }
}

/** Rate mesin aktual plate — dipakai service utk cache kolom KalkulasiPlate.mesinPerJam. */
export function resolveMesinAktual(p: PlateInputApp, deps: ResolveDeps): number {
  const aktual = p.printerProfileId ? deps.printerProfiles.find(pp => pp.id === p.printerProfileId) : undefined
  return aktual?.mesinPerJam ?? deps.rates.mesinPerJam
}

export function resolveInputV2(input: KalkulasiInput, deps: ResolveDeps): KalkulasiInputV2 {
  return {
    plates: input.plates.map(p => resolvePlate(p, deps)),
    batch: input.batch,
    komponen: input.komponen,
    labor: input.labor,
    // Paritas wrapper: rate konstan selalu diteruskan supaya plate 0-gram tetap kena buffer.
    // HANYA saat semua material tanpa profil — profil membawa failure rate per jenis.
    customRiskPct: input.customRiskPct ?? (
      input.plates.some(p => p.printerProfileId || p.materialProfileId || p.materials?.some(m => m.materialProfileId))
        ? undefined
        : deps.rates.failureRatePct
    ),
    hargaAktual: input.hargaShopeeAktual !== undefined
      ? { channelId: 'shopee', harga: input.hargaShopeeAktual }
      : undefined,
  }
}

/** Presenter — reproduksi pembulatan wrapper legacy PERSIS + snapshot channel. */
export function presentHasilV2(v2: HasilKalkulasiV2, settings: SettingsV2, hargaShopeeAktual?: number): HasilKalkulasi & { hargaChannelJson: string } {
  const hppFinishing = Math.round(v2.hppLabor)
  const hppTotal = v2.hppProduksi + v2.hppKomponen + hppFinishing
  const floorPrice = v2.jualBase + v2.hppKomponen + hppFinishing
  const m = settings.marginMultipliers
  const shopeeFee = settings.channels.find(c => c.id === 'shopee')?.feeMultiplier ?? 1.2
  const offlineA = floorPrice * m.A
  const offlineB = floorPrice * m.B
  const offlineC = floorPrice * m.C
  const shopeeA = offlineA * shopeeFee
  const shopeeB = offlineB * shopeeFee
  const shopeeC = offlineC * shopeeFee
  const marginOfflineA = offlineA > 0 ? ((offlineA - hppTotal) / offlineA) * 100 : 0
  const netShopeeA = shopeeA / shopeeFee
  const marginShopeeA = netShopeeA > 0 ? ((netShopeeA - hppTotal) / netShopeeA) * 100 : 0

  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPrice) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  const hargaChannel = settings.channels.map(ch => ({
    channelId: ch.id,
    A: Math.round(floorPrice * m.A * ch.feeMultiplier),
    B: Math.round(floorPrice * m.B * ch.feeMultiplier),
    C: Math.round(floorPrice * m.C * ch.feeMultiplier),
  }))

  return {
    hppProduksi: Math.round(v2.hppProduksi),
    hppKomponen: Math.round(v2.hppKomponen),
    hppFinishing,
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA), offlineB: Math.round(offlineB), offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA), shopeeB: Math.round(shopeeB), shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(offlineA),
    resellerBulk: Math.round(floorPrice * settings.resellerBulkMultiplier),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
    hargaChannelJson: JSON.stringify(hargaChannel),
  }
}

export function buildHasilV2(input: KalkulasiInput, deps: ResolveDeps): HasilKalkulasi & { hargaChannelJson: string } {
  const v2 = hitungKalkulasiV2(resolveInputV2(input, deps), deps.settings)
  return presentHasilV2(v2, deps.settings, input.hargaShopeeAktual)
}
