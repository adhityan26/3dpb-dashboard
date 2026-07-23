import type { PlateInputApp, FilamentEntry, FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"
import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot, Kalkulasi3mfDraft } from "./types"
import { matchPrinterProfile } from "./printer-mapping"

export interface BuildDraftInput {
  fileName: string
  slicePlates: SliceInfoPlate[]
  modelPlates: ModelSettingsPlate[]
  filamentSlots: ProjectFilamentSlot[]
  filamentCatalog: FilamentHargaData[]
  printerProfiles: PrinterProfileData[]
}

const UNSLICED_WARNING =
  "File ini belum di-slice — gramasi & durasi tidak tersedia. Isi manual, atau export ulang project setelah 'Slice all' di Bambu Studio/OrcaSlicer."

function deriveNama(fileName: string): string {
  return fileName.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "")
}

function findFilamentCatalogMatch(
  brand: string,
  material: string,
  catalog: FilamentHargaData[],
): FilamentHargaData | undefined {
  return catalog.find(
    f => f.brand.toLowerCase() === brand.toLowerCase() && f.material.toLowerCase() === material.toLowerCase(),
  )
}

function buildPlate(
  slicePlate: SliceInfoPlate | undefined,
  modelPlate: ModelSettingsPlate | undefined,
  index: number,
  filamentSlots: ProjectFilamentSlot[],
  filamentCatalog: FilamentHargaData[],
  printerProfiles: PrinterProfileData[],
  unmatchedFilamentCounter: { total: number; unmatched: number },
): PlateInputApp {
  const namaPart = modelPlate?.platerName?.trim() || `Plate ${index + 1}`
  const durasiJam = slicePlate ? slicePlate.predictionSec / 3600 : 0

  const printerMatch = slicePlate ? matchPrinterProfile(slicePlate.printerModelId, printerProfiles) : undefined

  const base: PlateInputApp = {
    namaPart,
    tipe: "FDM",
    gramasi: 0,
    durasiJam,
    printer: printerMatch?.nama,
    printerProfileId: printerMatch?.id,
  }

  const filaments = slicePlate?.filaments ?? []
  if (filaments.length === 0) return base

  const resolved = filaments.map(f => {
    const slot = filamentSlots[f.id - 1]
    const brand = slot?.vendor ?? ""
    const material = slot?.type || f.type
    unmatchedFilamentCounter.total += 1
    const match = findFilamentCatalogMatch(brand, material, filamentCatalog)
    if (!match) unmatchedFilamentCounter.unmatched += 1
    return { brand, material, color: f.color, gramasi: f.usedG, filamentId: match?.id, hargaPerGram: match?.hargaPerGram }
  })

  if (resolved.length === 1) {
    const only = resolved[0]
    return { ...base, gramasi: only.gramasi, filamentHargaId: only.filamentId, hargaPerGram: only.hargaPerGram }
  }

  const materials: FilamentEntry[] = resolved.map(r => ({
    brand: r.brand,
    material: r.material,
    color: r.color,
    gramasi: r.gramasi,
    ...(r.filamentId ? { filamentId: r.filamentId, hargaPerGram: r.hargaPerGram } : {}),
  }))
  return { ...base, materials }
}

export function buildKalkulasi3mfDraft(input: BuildDraftInput): Kalkulasi3mfDraft {
  const { fileName, slicePlates, modelPlates, filamentSlots, filamentCatalog, printerProfiles } = input
  const isSliced = slicePlates.length > 0
  const plateCount = Math.max(slicePlates.length, modelPlates.length)

  const unmatchedFilamentCounter = { total: 0, unmatched: 0 }
  const plates: PlateInputApp[] = Array.from({ length: plateCount }, (_, i) =>
    buildPlate(slicePlates[i], modelPlates[i], i, filamentSlots, filamentCatalog, printerProfiles, unmatchedFilamentCounter),
  )

  const objectCounts = (isSliced ? slicePlates.map(p => p.objectCount) : modelPlates.map(p => p.objectCount))
    .filter(c => c > 0)
  const batch = objectCounts.length > 0 ? Math.min(...objectCounts) : 1

  const warnings: string[] = []
  if (!isSliced) warnings.push(UNSLICED_WARNING)
  if (unmatchedFilamentCounter.unmatched > 0) {
    warnings.push(
      `${unmatchedFilamentCounter.unmatched} dari ${unmatchedFilamentCounter.total} filament belum ke-match katalog, isi manual di part-nya.`,
    )
  }

  return { nama: deriveNama(fileName), batch, plates, isSliced, warnings }
}
