const UNIT_SEC: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 }

/** Slicer duration text ("1d 2h 3m 4s", "18m 24s") to seconds; NaN when nothing parseable. */
export function parseSlicerDuration(text: string): number {
  let total = 0
  let found = false
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])\b/g)) {
    total += parseFloat(m[1]) * UNIT_SEC[m[2]]
    found = true
  }
  return found ? total : NaN
}
