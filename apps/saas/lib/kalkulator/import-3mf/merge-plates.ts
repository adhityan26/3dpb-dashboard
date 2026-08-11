/** Minimal plate shape needed for the pristine check — structural, so PlateRow
 *  (components/PlateInput.tsx) satisfies it without lib importing from components. */
export interface MergablePlate {
  nama: string;
  durasiJam: string;
  materials: { gramasi: string }[];
}

/** A plate is pristine when nothing meaningful has been filled in:
 *  empty name, zero/empty duration, and all material weights zero/empty. */
export function isPristinePlate(p: MergablePlate): boolean {
  return (
    p.nama.trim() === "" &&
    (Number(p.durasiJam) || 0) === 0 &&
    p.materials.every((m) => (Number(m.gramasi) || 0) === 0)
  );
}

/** Merge imported plates into the existing list: pristine placeholder rows are
 *  dropped, imported plates appended. `wasPristine` is true when ALL existing
 *  plates were pristine — the caller's signal to also apply batch/nama from the
 *  first imported file. */
export function mergeImportedPlates<T extends MergablePlate>(
  existing: T[],
  imported: T[],
): { plates: T[]; wasPristine: boolean } {
  const wasPristine = existing.every(isPristinePlate);
  return {
    plates: [...existing.filter((p) => !isPristinePlate(p)), ...imported],
    wasPristine,
  };
}
