import type { SliceInfoPlate, SliceInfoFilament } from "./types"

function metaValue(block: string, key: string): string | null {
  const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`))
  return m ? m[1] : null
}

function metaNumber(block: string, key: string): number {
  const v = metaValue(block, key)
  return v != null ? parseFloat(v) || 0 : 0
}

function attrValue(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\s${attr}="([^"]*)"`))
  return m ? m[1] : null
}

/** Order-independent per-attribute extraction — <object> attribute order isn't guaranteed. */
function parseObjects(block: string): { name: string; skipped: boolean }[] {
  const tags = block.match(/<object\s[^>]*\/>/g) ?? []
  return tags.map(tag => ({
    name: attrValue(tag, "name") ?? "",
    skipped: attrValue(tag, "skipped") === "true",
  }))
}

/** Satu plate bisa berisi banyak <object> instance yang sebenarnya SATU part yang sama
 *  dicetak berkali-kali (mis. 2 jenis part × 10 pasang = 20 object, tapi qty batch = 10),
 *  jadi jumlah part per batch dihitung dari jumlah TERKECIL antar grup nama object, bukan
 *  total object mentah. `consistent=false` kalau grup nama punya jumlah berbeda-beda
 *  (indikasi data ganjil / part memang tidak seimbang) — caller yang memutuskan warning-nya. */
function derivePartCount(objects: { name: string; skipped: boolean }[]): { count: number; consistent: boolean } {
  const active = objects.filter(o => !o.skipped)
  if (active.length === 0) return { count: 0, consistent: true }

  const counts = new Map<string, number>()
  for (const o of active) counts.set(o.name, (counts.get(o.name) ?? 0) + 1)
  const values = Array.from(counts.values())
  const count = Math.min(...values)
  return { count, consistent: values.every(v => v === count) }
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
    const { count: partCount, consistent: partCountConsistent } = derivePartCount(objects)
    return {
      index: metaNumber(block, "index"),
      weightG: metaNumber(block, "weight"),
      predictionSec: metaNumber(block, "prediction"),
      printerModelId: metaValue(block, "printer_model_id"),
      objectCount: objects.filter(o => !o.skipped).length,
      partCount,
      partCountConsistent,
      filaments: parseFilaments(block),
    }
  })
}
