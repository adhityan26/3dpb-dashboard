import type { KomponenItem, LaborItem } from "@3pb/kalkulator-core";

export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

export function composeKomponen(packing: { nama: string; harga: number } | undefined, rows: KomponenRow[]): KomponenItem[] {
  const items: KomponenItem[] = [];
  if (packing && packing.harga > 0) items.push({ nama: packing.nama.trim() || "Packing", harga: packing.harga, qty: 1 });
  for (const r of rows) {
    if (!r.nama.trim() || r.harga <= 0) continue;
    items.push({ nama: r.nama.trim(), harga: r.harga, qty: Math.max(1, r.qty) });
  }
  return items;
}

export function composeLabor(rows: LaborRow[]): LaborItem[] {
  const items: LaborItem[] = [];
  for (const r of rows) {
    const biaya = (r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0);
    if (!r.nama.trim() || biaya <= 0) continue;
    items.push({ nama: r.nama.trim(), jam: r.jam, ratePerJam: r.ratePerJam, flat: r.flat });
  }
  return items;
}
