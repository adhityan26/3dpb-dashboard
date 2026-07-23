import type { SliceInfoPlate, SliceInfoFilament } from "./types"

function metaValue(block: string, key: string): string | null {
  const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`))
  return m ? m[1] : null
}

function metaNumber(block: string, key: string): number {
  const v = metaValue(block, key)
  return v != null ? parseFloat(v) || 0 : 0
}

function parseObjects(block: string): { skipped: boolean }[] {
  const matches = block.matchAll(/<object\s+identify_id="[^"]*"[^>]*skipped="([^"]*)"/g)
  return Array.from(matches, m => ({ skipped: m[1] === "true" }))
}

function parseFilaments(block: string): SliceInfoFilament[] {
  const matches = block.matchAll(
    /<filament\s+id="(\d+)"[^>]*type="([^"]*)"[^>]*color="([^"]*)"[^>]*used_g="([^"]*)"/g
  )
  return Array.from(matches, m => ({
    id: parseInt(m[1], 10),
    type: m[2],
    color: m[3],
    usedG: parseFloat(m[4]) || 0,
  }))
}

/** Parse Metadata/slice_info.config. Returns [] if the file has no <plate> block
 *  (i.e. the 3MF is a plain arrange, not sliced yet). */
export function parseSliceInfo(xml: string): SliceInfoPlate[] {
  const plateBlocks = xml.match(/<plate>[\s\S]*?<\/plate>/g)
  if (!plateBlocks) return []

  return plateBlocks.map(block => {
    const objects = parseObjects(block)
    return {
      index: metaNumber(block, "index"),
      weightG: metaNumber(block, "weight"),
      predictionSec: metaNumber(block, "prediction"),
      printerModelId: metaValue(block, "printer_model_id"),
      objectCount: objects.filter(o => !o.skipped).length,
      filaments: parseFilaments(block),
    }
  })
}
