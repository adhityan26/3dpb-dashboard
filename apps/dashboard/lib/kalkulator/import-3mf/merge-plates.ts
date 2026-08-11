import type { PlateInputApp } from "@/lib/kalkulator/types"

/** A plate is pristine when nothing meaningful has been filled in: no part name,
 *  zero weight, zero duration, and (if multi-material) all material weights zero. */
export function isPristinePlate(p: PlateInputApp): boolean {
  return (
    !p.namaPart?.trim() &&
    (p.gramasi ?? 0) === 0 &&
    p.durasiJam === 0 &&
    (p.materials ?? []).every(m => (m.gramasi || 0) === 0)
  )
}

/** Merge imported plates into the existing list: pristine placeholder rows are
 *  dropped, imported plates appended. `wasPristine` is true when ALL existing
 *  plates were pristine — the caller's signal to also apply nama/batch from the
 *  first imported file. */
export function mergeImportedPlates<T extends PlateInputApp>(
  existing: T[],
  imported: T[],
): { plates: T[]; wasPristine: boolean } {
  const wasPristine = existing.every(isPristinePlate)
  return {
    plates: [...existing.filter(p => !isPristinePlate(p)), ...imported],
    wasPristine,
  }
}
