// Stable stringify + tiny non-crypto hash for STL staleness comparison.
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj)
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",")}}`
}

export function hashLgConfig(config: Record<string, unknown>): string {
  const s = stableStringify(config)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}
