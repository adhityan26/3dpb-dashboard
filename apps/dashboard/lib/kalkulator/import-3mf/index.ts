import type { FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"
import type { Kalkulasi3mfDraft } from "./types"
import { readGcode3mfEntries } from "./read-zip"
import { parseSliceInfo } from "./parse-slice-info"
import { parseModelSettingsPlates } from "./parse-model-settings"
import { parseProjectSettingsFilamentSlots } from "./parse-project-settings"
import { buildKalkulasi3mfDraft } from "./build-draft"

export interface Import3mfDeps {
  filamentCatalog: FilamentHargaData[]
  printerProfiles: PrinterProfileData[]
}

/** Parse file .3mf/.gcode.3mf jadi draft siap pakai untuk KalkulasiForm.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function import3mfFile(file: File, deps: Import3mfDeps): Promise<Kalkulasi3mfDraft> {
  const buf = await file.arrayBuffer()
  const entries = await readGcode3mfEntries(buf)
  if (!entries) {
    throw new Error("Format 3MF tidak dikenali — bukan file 3MF dari Bambu Studio/OrcaSlicer, atau file rusak.")
  }

  const slicePlates = entries.sliceInfoXml ? parseSliceInfo(entries.sliceInfoXml) : []
  const modelPlates = entries.modelSettingsXml ? parseModelSettingsPlates(entries.modelSettingsXml) : []
  const filamentSlots = entries.projectSettingsJson ? parseProjectSettingsFilamentSlots(entries.projectSettingsJson) : []

  return buildKalkulasi3mfDraft({
    fileName: file.name,
    slicePlates,
    modelPlates,
    filamentSlots,
    filamentCatalog: deps.filamentCatalog,
    printerProfiles: deps.printerProfiles,
  })
}
