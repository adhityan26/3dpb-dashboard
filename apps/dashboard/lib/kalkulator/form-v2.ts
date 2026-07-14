import type { KomponenItem, PackingType, MarginTier } from '@3pb/kalkulator-core'
import { buildHasilV2, type ResolveDeps } from './resolve-v2'
import type { KalkulasiInput } from './types'

export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

const PACKING_RE = /^Packing (S|M|L|XL)$/

/** Susun payload komponen[]: packing terpilih (item pertama) + baris valid. */
export function composeKomponen(
  packingType: PackingType | undefined,
  packingRates: Record<string, number>,
  rows: KomponenRow[],
): KomponenItem[] {
  const items: KomponenItem[] = []
  if (packingType) items.push({ nama: `Packing ${packingType}`, harga: packingRates[packingType] ?? 0, qty: 1 })
  for (const r of rows) {
    if (!r.nama.trim() || r.harga <= 0) continue
    items.push({ nama: r.nama.trim(), harga: r.harga, qty: Math.max(1, r.qty) })
  }
  return items
}

/** Pecah komponen tersimpan untuk edit-reload: baris "Packing X" diangkat jadi chip
 *  HANYA kalau kolom packingType kosong (record bentuk baru; record lama masih
 *  menyimpan packing di kolom, bukan di baris komponen). */
export function splitPackingRow(
  packingTypeCol: string | null | undefined,
  rows: { nama: string; harga: number; qty: number }[],
): { packingType?: PackingType; rows: { nama: string; harga: number; qty: number }[] } {
  if (packingTypeCol) return { packingType: packingTypeCol as PackingType, rows }
  const idx = rows.findIndex(r => PACKING_RE.test(r.nama))
  if (idx === -1) return { rows }
  const type = rows[idx].nama.match(PACKING_RE)![1] as PackingType
  return { packingType: type, rows: rows.filter((_, i) => i !== idx) }
}

export interface PrinterMarginRow {
  id: string; nama: string; hppTotal: number
  marginOffline: number; marginShopee: number; isPricingReference: boolean
}

/** Bandingkan profitabilitas per printer: harga jual TETAP (mesin acuan),
 *  HPP dihitung seolah SEMUA plate dicetak di printer tsb. */
export function hitungPerbandinganPrinter(input: KalkulasiInput, deps: ResolveDeps, marginTier: MarginTier): PrinterMarginRow[] {
  if (deps.printerProfiles.length === 0 || input.plates.length === 0) return []
  const basis = buildHasilV2(input, deps)
  const offline = marginTier === 'B' ? basis.offlineB : marginTier === 'C' ? basis.offlineC : basis.offlineA
  const shopee = marginTier === 'B' ? basis.shopeeB : marginTier === 'C' ? basis.shopeeC : basis.shopeeA
  const fee = deps.settings.channels.find(c => c.id === 'shopee')?.feeMultiplier ?? 1.2
  const net = shopee / fee
  return deps.printerProfiles.map(pp => {
    const h = buildHasilV2({ ...input, plates: input.plates.map(p => ({ ...p, printerProfileId: pp.id })) }, deps)
    return {
      id: pp.id, nama: pp.nama, hppTotal: h.hppTotal,
      marginOffline: offline > 0 ? Math.round(((offline - h.hppTotal) / offline) * 1000) / 10 : 0,
      marginShopee: net > 0 ? Math.round(((net - h.hppTotal) / net) * 1000) / 10 : 0,
      isPricingReference: pp.isPricingReference,
    }
  })
}
