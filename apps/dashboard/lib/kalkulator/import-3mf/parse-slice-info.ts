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

function attrValue(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\s${attr}="([^"]*)"`))
  return m ? m[1] : null
}

/** Order-independent per-attribute extraction — slicer versions (Bambu Studio,
 *  OrcaSlicer) don't guarantee a fixed attribute order on <filament> tags. */
function parseFilaments(block: string): SliceInfoFilament[] {
  const tags = block.match(/<filament\s[^>]*\/>/g) ?? []
  return tags
    .map(tag => {
      const id = attrValue(tag, "id")
      if (id == null) return null
      return {
        id: parseInt(id, 10),
        type: attrValue(tag, "type") ?? "",
        color: attrValue(tag, "color") ?? "",
        usedG: parseFloat(attrValue(tag, "used_g") ?? "") || 0,
      }
    })
    .filter((f): f is SliceInfoFilament => f !== null)
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
