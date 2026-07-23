import JSZip from "jszip"
import type { Raw3mfEntries } from "./types"

const METADATA_PATHS = {
  modelSettingsXml: "Metadata/model_settings.config",
  projectSettingsJson: "Metadata/project_settings.config",
  sliceInfoXml: "Metadata/slice_info.config",
} as const

/** Buka ZIP .3mf dan ambil 3 file metadata kecil — G-code besar (Metadata/plate_N.gcode)
 *  sama sekali tidak disentuh. Return null kalau ZIP invalid atau bukan 3MF Bambu Studio
 *  sama sekali (model_settings.config tidak ada — struktur ini selalu ada baik file
 *  sudah/belum di-slice). */
export async function readGcode3mfEntries(buf: ArrayBuffer): Promise<Raw3mfEntries | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return null
  }

  if (!zip.file(METADATA_PATHS.modelSettingsXml)) return null

  const entries: Record<string, string | null> = {}
  for (const [key, path] of Object.entries(METADATA_PATHS)) {
    const file = zip.file(path)
    entries[key] = file ? await file.async("string") : null
  }

  return entries as unknown as Raw3mfEntries
}
