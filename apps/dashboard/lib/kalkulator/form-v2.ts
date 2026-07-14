import type { KomponenItem, PackingType } from '@3pb/kalkulator-core'

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
