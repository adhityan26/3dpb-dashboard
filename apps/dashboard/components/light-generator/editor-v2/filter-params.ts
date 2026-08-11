// Pure helpers for the v2 inspector.
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

/**
 * Pure coercion for a single inspector field edit.
 *
 * - "number" fields: an empty string clears the key (so the generator's own
 *   default applies) rather than saving NaN/"" into the config; a valid
 *   numeric string is coerced with `Number(...)`; a non-numeric string is
 *   ignored entirely (returns null — caller must not call onChange).
 * - "boolean" fields pass through unchanged.
 *
 * Returns the next config object, or null if the edit should be ignored.
 */
export function coerceParamValue(
  config: Record<string, unknown>,
  key: string,
  raw: unknown,
  type: "number" | "boolean",
): Record<string, unknown> | null {
  if (type === "boolean") {
    return { ...config, [key]: raw }
  }
  if (raw === "" || raw === null || raw === undefined) {
    const next = { ...config }
    delete next[key]
    return next
  }
  const n = Number(raw)
  if (Number.isNaN(n)) return null
  return { ...config, [key]: n }
}
