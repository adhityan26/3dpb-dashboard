import { parseSlicerDuration } from "./parse-duration"
import type { GcodeFilament, GcodeSlicer, GcodeSummary } from "./types"

// Bambu Studio: summary in the header block, config block right after it (start of file).
// Weights are listed only for USED filaments, in the order of the `; filament:` slot-id list.
const BAMBU_TIME = /^; model printing time: [^;\n]*; total estimated time: ([^\n]+)$/m
const BAMBU_WEIGHT = /^; total filament weight \[g\] : ([^\n]+)$/m
const BAMBU_SLOT_IDS = /^; filament: ([\d,]+)$/m
// OrcaSlicer family (incl. Snapmaker Orca): summary + config block in the footer.
const ORCA_TIME = /^; estimated printing time \(normal mode\) = ([^\n]+)$/m
const ORCA_WEIGHT = /^; filament used \[g\] = ([^\n]+)$/m
const ORCA_CHANGES = /^; total filament change = (\d+)/m

function match1(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[1].trim() : null
}

/** `; key = a;b;"c"` config line as a list, quotes stripped; [] when absent. */
function configList(text: string, key: string): string[] {
  const raw = match1(text, new RegExp(`^; ${key} = ([^\\n]*)$`, "m"))
  if (raw == null) return []
  return raw.split(";").map(s => s.trim().replace(/^"(.*)"$/, "$1"))
}

/** Bambu or Orca summary pair (time + weights); Bambu wins when both are complete. */
function detect(text: string): { slicer: GcodeSlicer; timeRaw: string; weightRaw: string } | null {
  const bambuTime = match1(text, BAMBU_TIME)
  const bambuWeight = match1(text, BAMBU_WEIGHT)
  if (bambuTime != null && bambuWeight != null) return { slicer: "bambu", timeRaw: bambuTime, weightRaw: bambuWeight }
  // Orca builds for Bambu printers may also print a Bambu-style time line in the header.
  const orcaTime = match1(text, ORCA_TIME)
  const orcaWeight = match1(text, ORCA_WEIGHT)
  if (orcaTime != null && orcaWeight != null) return { slicer: "orca", timeRaw: orcaTime, weightRaw: orcaWeight }
  return null
}

/** 1-based slot id per weight: Bambu's `; filament:` list when it lines up, else positional. */
function slotIds(text: string, slicer: GcodeSlicer, count: number): number[] {
  const positional = Array.from({ length: count }, (_, i) => i + 1)
  if (slicer !== "bambu") return positional
  const raw = match1(text, BAMBU_SLOT_IDS)
  const ids = raw ? raw.split(",").map(s => parseInt(s, 10)) : []
  return ids.length === count && ids.every(n => n > 0) ? ids : positional
}

/** Parse the print summary from the first and last chunk of a raw .gcode.
 *  Returns null when neither a Bambu nor an Orca summary is found, or it is incomplete.
 *  For files smaller than head+tail the chunks overlap; first-match lookups make that harmless. */
export function parseGcodeSummary(head: string, tail: string): GcodeSummary | null {
  const text = `${head}\n${tail}`.replace(/\r/g, "")

  const found = detect(text)
  if (found == null) return null
  const { slicer, timeRaw, weightRaw } = found

  const totalSec = parseSlicerDuration(timeRaw)
  if (!Number.isFinite(totalSec)) return null

  const weights = weightRaw.split(",").map(s => parseFloat(s.trim()))
  if (weights.some(w => !Number.isFinite(w))) return null

  const ids = slotIds(text, slicer, weights.length)
  const types = configList(text, "filament_type")
  const colors = configList(text, "filament_colour")
  const vendors = configList(text, "filament_vendor")
  const filaments: GcodeFilament[] = weights
    .map((usedG, i) => {
      const slot = ids[i] - 1
      const f: GcodeFilament = { index: ids[i], usedG }
      if (types[slot]) f.type = types[slot]
      if (colors[slot]) f.color = colors[slot]
      if (vendors[slot]) f.vendor = vendors[slot]
      return f
    })
    .filter(f => f.usedG > 0)

  const summary: GcodeSummary = { slicer, totalSec, filaments }
  const changes = match1(text, ORCA_CHANGES)
  if (changes != null) summary.filamentChanges = parseInt(changes, 10)
  const printerModel = configList(text, "printer_model")[0]
  if (printerModel) summary.printerModel = printerModel
  return summary
}
