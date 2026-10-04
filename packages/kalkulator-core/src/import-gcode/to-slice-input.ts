import type { ProjectFilamentSlot, SliceInfoPlate } from "../import-3mf/types"
import type { GcodeSummary } from "./types"

export interface GcodeSliceInput {
  slicePlate: SliceInfoPlate
  filamentSlots: ProjectFilamentSlot[]
}

/** Map a raw-gcode summary onto the slice_info shapes the 3MF import already consumes:
 *  one plate, batch 1 (gcode has no reliable object count), slots addressed by `index - 1`. */
export function gcodeSummaryToSliceInput(summary: GcodeSummary): GcodeSliceInput {
  const maxIndex = summary.filaments.reduce((m, f) => Math.max(m, f.index), 0)
  const filamentSlots: ProjectFilamentSlot[] = Array.from({ length: maxIndex }, () => ({ vendor: "", type: "" }))
  for (const f of summary.filaments) {
    filamentSlots[f.index - 1] = { vendor: f.vendor ?? "", type: f.type ?? "" }
  }

  const weightG = Math.round(summary.filaments.reduce((sum, f) => sum + f.usedG, 0) * 100) / 100

  return {
    slicePlate: {
      index: 1,
      weightG,
      predictionSec: summary.totalSec,
      // slice_info model codes (e.g. "C12") feed the dashboard printer mapping; a display name
      // like "Bambu Lab P1S" would not match, so it stays null. GcodeSummary.printerModel keeps it.
      printerModelId: null,
      objectCount: 1,
      partCount: 1,
      partCountConsistent: true,
      filaments: summary.filaments.map(f => ({ id: f.index, type: f.type ?? "", color: f.color ?? "", usedG: f.usedG })),
    },
    filamentSlots,
  }
}
