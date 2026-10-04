export type GcodeSlicer = "bambu" | "orca"

/** One filament slot with non-zero usage. `index` is 1-based, matching the slicer's slot order. */
export interface GcodeFilament {
  index: number
  usedG: number
  type?: string
  color?: string
  vendor?: string
}

/** Print summary read from a raw .gcode header/footer (Bambu Studio or OrcaSlicer family). */
export interface GcodeSummary {
  slicer: GcodeSlicer
  /** Total estimated time including prepare — same meaning as slice_info `prediction`. */
  totalSec: number
  filaments: GcodeFilament[]
  /** Orca only: `; total filament change = N`. */
  filamentChanges?: number
  printerModel?: string
}
