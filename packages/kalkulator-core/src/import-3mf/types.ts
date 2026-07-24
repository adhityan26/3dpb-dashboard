/** Satu <filament> di dalam satu <plate> — Metadata/slice_info.config */
export interface SliceInfoFilament {
  id: number
  type: string
  color: string
  usedG: number
}

/** Satu <plate> — Metadata/slice_info.config */
export interface SliceInfoPlate {
  index: number
  weightG: number
  predictionSec: number
  printerModelId: string | null
  /** Total object non-skipped di plate ini (semua part, tanpa grouping nama). */
  objectCount: number
  /** Qty batch per plate: object non-skipped di-group per nama, diambil jumlah TERKECIL
   *  antar grup — mengatasi kasus 1 plate berisi >1 jenis part yang dicetak sepasang/lebih
   *  (mis. 2 part × 10 pasang = 20 object mentah, tapi partCount = 10). */
  partCount: number
  /** false kalau grup nama object di plate ini punya jumlah tidak sama rata (data ganjil) —
   *  partCount tetap terisi (angka terkecil), caller yang memutuskan mau warning atau tidak. */
  partCountConsistent: boolean
  filaments: SliceInfoFilament[]
}

/** Satu <plate> — Metadata/model_settings.config */
export interface ModelSettingsPlate {
  platerId: number
  platerName: string
  objectCount: number
}

/** Satu slot filament (AMS) — Metadata/project_settings.config, index 0-based selaras filament id-1 */
export interface ProjectFilamentSlot {
  vendor: string
  type: string
}

/** 3 file metadata mentah yang diekstrak dari ZIP .3mf */
export interface Raw3mfEntries {
  sliceInfoXml: string | null
  projectSettingsJson: string | null
  modelSettingsXml: string | null
}
