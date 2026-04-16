import type { FilamentCatalogEntry } from './types'

// Brand prefix → matcher function
const BRAND_MATCHERS: Array<{ prefixes: string[]; match: (brand: string) => boolean }> = [
  { prefixes: ['esun', 'esun'], match: (b) => /esun/i.test(b) },
  { prefixes: ['bl'],           match: (b) => /bambu/i.test(b) },
  { prefixes: ['pm'],           match: (b) => /polymaker/i.test(b) },
  { prefixes: ['sunlu'],        match: (b) => /sunlu/i.test(b) },
]

// Material-only keywords — if the remainder is just a material, skip color matching
const MATERIAL_KEYWORDS = ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'PA', 'PC', 'PLA+', 'PCTG']

function brandMatcher(prefix: string): ((brand: string) => boolean) | null {
  const p = prefix.toLowerCase()
  return BRAND_MATCHERS.find((m) => m.prefixes.includes(p))?.match ?? null
}

/**
 * Resolve a short filament name (e.g. "Esun Black", "BL Dark Blue")
 * to the best-matching FilamentCatalog entry, for color hex display.
 * Returns null if no confident match found.
 */
export function resolveFilamentToCatalog(
  filamentName: string,
  catalog: FilamentCatalogEntry[]
): FilamentCatalogEntry | null {
  const parts = filamentName.trim().split(/\s+/)
  if (parts.length === 0) return null

  const prefix = parts[0]
  const remainder = parts.slice(1).join(' ').trim()
  if (!remainder) return null

  // Material-only? (e.g. "Esun PETG") — no specific color, skip
  if (MATERIAL_KEYWORDS.some((m) => m.toLowerCase() === remainder.toLowerCase())) return null

  const matcher = brandMatcher(prefix)
  if (!matcher) return null

  const byBrand = catalog.filter((e) => matcher(e.brand))
  if (byBrand.length === 0) return null

  const q = remainder.toLowerCase()

  // Exact colorName match first
  const exact = byBrand.find((e) => e.colorName.toLowerCase() === q)
  if (exact) return exact

  // Partial: colorName contains query OR query contains colorName
  const partials = byBrand.filter(
    (e) => e.colorName.toLowerCase().includes(q) || q.includes(e.colorName.toLowerCase())
  )
  if (partials.length === 1) return partials[0]
  if (partials.length > 1) {
    // Prefer shorter colorName (more specific match)
    return partials.sort((a, b) => a.colorName.length - b.colorName.length)[0]
  }

  return null
}
