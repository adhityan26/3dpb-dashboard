// Pure helper for the v2 inspector's parameter search box.
import type { SECTIONS as SectionsType } from "../config-params"

export function filterSections(
  sections: typeof SectionsType,
  query: string,
) {
  const q = query.trim().toLowerCase()
  if (!q) return sections
  return sections
    .map((s) => ({
      ...s,
      params: s.params.filter(
        (p) => p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.params.length > 0)
}
