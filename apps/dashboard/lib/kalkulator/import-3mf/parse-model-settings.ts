import type { ModelSettingsPlate } from "./types"

function metaValue(block: string, key: string): string {
  const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`))
  return m ? m[1] : ""
}

/** Parse Metadata/model_settings.config — nama plate + jumlah objek per plate.
 *  Dipakai baik untuk file sliced maupun belum-sliced (struktur ini selalu ada). */
export function parseModelSettingsPlates(xml: string): ModelSettingsPlate[] {
  const plateBlocks = xml.match(/<plate>[\s\S]*?<\/plate>/g)
  if (!plateBlocks) return []

  return plateBlocks.map(block => {
    const instanceCount = (block.match(/<model_instance>/g) ?? []).length
    return {
      platerId: parseInt(metaValue(block, "plater_id"), 10) || 0,
      platerName: metaValue(block, "plater_name"),
      objectCount: instanceCount,
    }
  })
}
