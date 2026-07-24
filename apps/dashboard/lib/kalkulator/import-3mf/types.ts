import type { PlateInputApp } from "@/lib/kalkulator/types"

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
