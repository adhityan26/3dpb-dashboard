import type { PlateInputApp } from "@/lib/kalkulator/types"

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
  objectCount: number
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

/** Hasil akhir siap di-apply ke state form KalkulasiForm */
export interface Kalkulasi3mfDraft {
  nama: string
  batch: number
  plates: PlateInputApp[]
  isSliced: boolean
  warnings: string[]
  /** Thumbnail preview per plate (index-aligned dengan `plates`), null kalau plate itu
   *  tidak punya Metadata/plate_N.png di ZIP-nya. */
  thumbnails: (Blob | null)[]
}
