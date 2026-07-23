import { isValidHexColor } from '@3pb/ui'
import type { FilamentCatalogEntry } from '@/lib/filamen/types'

/** Cocokin dua string (brand ATAU material) pakai substring dua arah, case-insensitive.
 *  Field kosong dianggap "cocok apa aja" (tidak nge-filter). Pola sama persis dengan
 *  materialProfileMatchesFilament di PlateTable.tsx. */
export function catalogMatchesFilament(catalogField: string, filamentField: string): boolean {
  const a = catalogField.trim().toLowerCase()
  const b = filamentField.trim().toLowerCase()
  if (!a || !b) return true
  return a.includes(b) || b.includes(a)
}

/** Cari semua entry FilamentCatalog yang brand+material-nya fuzzy-match ke filament
 *  yang lagi dipilih. `catalog` adalah bentuk yang dikembalikan useCatalog(): nested by
 *  brand lalu material. */
export function findCatalogColorsForFilament(
  catalog: Record<string, Record<string, FilamentCatalogEntry[]>>,
  brand: string,
  material: string,
): FilamentCatalogEntry[] {
  const result: FilamentCatalogEntry[] = []
  for (const catalogBrand of Object.keys(catalog)) {
    if (!catalogMatchesFilament(catalogBrand, brand)) continue
    for (const catalogMaterial of Object.keys(catalog[catalogBrand])) {
      if (!catalogMatchesFilament(catalogMaterial, material)) continue
      result.push(...catalog[catalogBrand][catalogMaterial])
    }
  }
  return result
}

function hexToRgb(hex: string): [number, number, number] | null {
  const stripped = hex.trim().replace(/^#/, '')
  if (stripped.length !== 3 && stripped.length !== 6) return null
  const full = stripped.length === 3 ? stripped.split('').map(c => c + c).join('') : stripped
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return null
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function hexDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  if (!rgbA || !rgbB) return Infinity
  return Math.sqrt((rgbA[0] - rgbB[0]) ** 2 + (rgbA[1] - rgbB[1]) ** 2 + (rgbA[2] - rgbB[2]) ** 2)
}

/** Sort katalog warna: kalau referenceColor hex valid (biasa dari hasil import 3MF),
 *  urutkan by jarak RGB terdekat dulu. Kalau kosong/invalid, urutkan alfabetis by nama. */
export function sortCatalogColors(entries: FilamentCatalogEntry[], referenceColor: string | undefined): FilamentCatalogEntry[] {
  const ref = referenceColor && isValidHexColor(referenceColor) ? referenceColor : null
  const sorted = [...entries]
  if (ref) {
    sorted.sort((a, b) => hexDistance(a.colorHex, ref) - hexDistance(b.colorHex, ref))
  } else {
    sorted.sort((a, b) => a.colorName.localeCompare(b.colorName))
  }
  return sorted
}
