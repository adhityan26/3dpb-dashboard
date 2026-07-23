import type { ProjectFilamentSlot } from "./types"

/** Parse Metadata/project_settings.config — array filament_vendor[]/filament_type[]
 *  selaras index dengan `filament id` (1-based) di slice_info.config. */
export function parseProjectSettingsFilamentSlots(json: string): ProjectFilamentSlot[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (typeof parsed !== "object" || parsed === null) return []
  const obj = parsed as Record<string, unknown>
  const vendors = Array.isArray(obj.filament_vendor) ? obj.filament_vendor : []
  const types = Array.isArray(obj.filament_type) ? obj.filament_type : []
  const len = Math.max(vendors.length, types.length)
  if (len === 0) return []

  return Array.from({ length: len }, (_, i) => ({
    vendor: typeof vendors[i] === "string" ? vendors[i] : "",
    type: typeof types[i] === "string" ? types[i] : "",
  }))
}
