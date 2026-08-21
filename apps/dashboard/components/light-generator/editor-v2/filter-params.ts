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

/**
 * Decides whether applying the Raw JSON draft should be blocked with a
 * warning instead of silently merging.
 *
 * Scenario this guards against: user opens Raw JSON, types an edit (draft
 * becomes dirty, `dirtySnapshot` is captured as the config at that moment),
 * closes the accordion, edits a field elsewhere (a slider), reopens Raw
 * JSON, clicks Apply. If Apply just merges `{ ...config, ...incoming }`
 * using the *current* config as the base, that's fine — but `incoming` was
 * parsed from a draft that still reflects the *old* config, so keys the
 * slider changed get clobbered back to their stale values. We can't tell
 * which keys are "safe" from JSON alone, so instead we compare the config
 * as of when the draft went dirty (`dirtySnapshot`) against the config now
 * (`currentConfigStr`): if they differ, something changed underneath the
 * draft and applying it unconditionally would silently lose that change.
 *
 * `dirtySnapshot` is null when the draft isn't dirty (nothing to protect).
 */
export function shouldWarnJsonApply(
  dirtySnapshot: string | null,
  currentConfigStr: string,
): boolean {
  if (dirtySnapshot === null) return false
  return dirtySnapshot !== currentConfigStr
}
