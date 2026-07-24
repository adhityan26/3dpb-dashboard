import { describe, it, expect } from "vitest"
import { buildKalkulasi3mfDraft } from "../build-draft"
import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot } from "@3pb/kalkulator-core/import-3mf"
import type { FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

function printerProfile(id: string, nama: string): PrinterProfileData {
  return {
    id, nama, mesinPerJam: 5000, watt: null, tarifPerKwh: null,
    hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null,
    isDefault: false, isPricingReference: false,
  }
}

const SLICE_PLATES: SliceInfoPlate[] = [
  {
    index: 1, weightG: 114.44, predictionSec: 19939, printerModelId: "C12",
    objectCount: 28, partCount: 28, partCountConsistent: true,
    filaments: [
      { id: 1, type: "PLA", color: "#000000", usedG: 96.26 },
      { id: 2, type: "PLA", color: "#FE7E62", usedG: 1.28 },
    ],
  },
  {
    index: 2, weightG: 245.82, predictionSec: 30867, printerModelId: "C12",
    objectCount: 5, partCount: 5, partCountConsistent: true, // sengaja lebih kecil dari plate 1 → batch harus ambil ini
    filaments: [
      { id: 1, type: "PLA", color: "#000000", usedG: 242.90 },
    ],
  },
]

const MODEL_PLATES: ModelSettingsPlate[] = [
  { platerId: 1, platerName: "plate-1", objectCount: 28 },
  { platerId: 2, platerName: "", objectCount: 5 },
]

const FILAMENT_SLOTS: ProjectFilamentSlot[] = [
  { vendor: "Bambu Lab", type: "PLA" },
  { vendor: "Bambu Lab", type: "PLA" },
]

const FILAMENT_CATALOG: FilamentHargaData[] = [
  { id: "fh1", brand: "Bambu Lab", material: "PLA", hargaPerGram: 300, spoolCount: 2 },
]

const PRINTER_PROFILES: PrinterProfileData[] = [printerProfile("pp1", "Bambu Lab P1S")]

describe("buildKalkulasi3mfDraft — sliced file", () => {
  const draft = buildKalkulasi3mfDraft({
    fileName: "Asset 4-sushitei.gcode.3mf",
    slicePlates: SLICE_PLATES,
    modelPlates: MODEL_PLATES,
    filamentSlots: FILAMENT_SLOTS,
    filamentCatalog: FILAMENT_CATALOG,
    printerProfiles: PRINTER_PROFILES,
  })

  it("derives nama kalkulasi from the file name, stripping .gcode.3mf", () => {
    expect(draft.nama).toBe("Asset 4-sushitei")
  })

  it("takes the SMALLEST partCount (per-name-grouped object count) across plates as batch", () => {
    expect(draft.batch).toBe(5)
  })

  it("marks the draft as sliced with no warnings", () => {
    expect(draft.isSliced).toBe(true)
    expect(draft.warnings).toEqual([])
  })

  it("creates one PlateInputApp per plate, named from plater_name with 'Plate N' fallback", () => {
    expect(draft.plates).toHaveLength(2)
    expect(draft.plates[0].namaPart).toBe("plate-1")
    expect(draft.plates[1].namaPart).toBe("Plate 2") // plater_name kosong di MODEL_PLATES
  })

  it("uses single-material mode + matched filament catalog entry when a plate has exactly 1 filament", () => {
    const plate2 = draft.plates[1]
    expect(plate2.tipe).toBe("FDM")
    expect(plate2.gramasi).toBe(242.90)
    expect(plate2.durasiJam).toBeCloseTo(30867 / 3600, 5)
    expect(plate2.materials).toBeUndefined()
    expect(plate2.filamentHargaId).toBe("fh1")
    expect(plate2.hargaPerGram).toBe(300)
  })

  it("switches to multi-material mode when a plate has >1 filament, one FilamentEntry per filament", () => {
    const plate1 = draft.plates[0]
    expect(plate1.materials).toHaveLength(2)
    expect(plate1.materials?.[0]).toEqual({
      brand: "Bambu Lab", material: "PLA", color: "#000000", gramasi: 96.26,
      filamentId: "fh1", hargaPerGram: 300,
    })
    // filament id=2 has the SAME brand+material as id=1 (both "Bambu Lab"/"PLA") — a catalog
    // entry is just a price reference (Rp/gram), not consumed inventory, so it matches too.
    expect(plate1.materials?.[1]).toEqual({
      brand: "Bambu Lab", material: "PLA", color: "#FE7E62", gramasi: 1.28,
      filamentId: "fh1", hargaPerGram: 300,
    })
  })

  it("maps printer_model_id to a matching PrinterProfileData on every plate", () => {
    expect(draft.plates[0].printer).toBe("Bambu Lab P1S")
    expect(draft.plates[0].printerProfileId).toBe("pp1")
  })
})

describe("buildKalkulasi3mfDraft — unsliced file (no slicePlates)", () => {
  it("still creates parts from modelPlates, but leaves gramasi/durasi empty and adds a warning", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "Asset 4-sushitei.3mf",
      slicePlates: [],
      modelPlates: MODEL_PLATES,
      filamentSlots: [],
      filamentCatalog: [],
      printerProfiles: [],
    })
    expect(draft.isSliced).toBe(false)
    expect(draft.plates).toHaveLength(2)
    expect(draft.plates[0].gramasi).toBe(0)
    expect(draft.plates[0].durasiJam).toBe(0)
    expect(draft.batch).toBe(5) // masih bisa dari modelPlates.objectCount
    expect(draft.warnings).toContain(
      "File ini belum di-slice — gramasi & durasi tidak tersedia. Isi manual, atau export ulang project setelah 'Slice all' di Bambu Studio/OrcaSlicer."
    )
  })
})

describe("buildKalkulasi3mfDraft — batch dari partCount (1 plate, >1 jenis part)", () => {
  it("uses partCount (bukan objectCount mentah) as batch when a plate has multiple part names printed in pairs", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "gantungan-sepasang.gcode.3mf",
      slicePlates: [
        {
          index: 1, weightG: 50, predictionSec: 3600, printerModelId: "C12",
          objectCount: 20, partCount: 10, partCountConsistent: true, // 2 part name × 10 pasang
          filaments: [{ id: 1, type: "PLA", color: "#000000", usedG: 50 }],
        },
      ],
      modelPlates: [{ platerId: 1, platerName: "plate-1", objectCount: 20 }],
      filamentSlots: [{ vendor: "Bambu Lab", type: "PLA" }],
      filamentCatalog: FILAMENT_CATALOG,
      printerProfiles: [],
    })
    expect(draft.batch).toBe(10)
    expect(draft.warnings).toEqual([])
  })

  it("adds a warning when per-name groups in a plate are uneven, still using the smallest as batch", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "ganjil.gcode.3mf",
      slicePlates: [
        {
          index: 1, weightG: 50, predictionSec: 3600, printerModelId: "C12",
          objectCount: 18, partCount: 8, partCountConsistent: false, // 10 vs 8 — ganjil
          filaments: [{ id: 1, type: "PLA", color: "#000000", usedG: 50 }],
        },
      ],
      modelPlates: [{ platerId: 1, platerName: "plate-1", objectCount: 18 }],
      filamentSlots: [{ vendor: "Bambu Lab", type: "PLA" }],
      filamentCatalog: FILAMENT_CATALOG,
      printerProfiles: [],
    })
    expect(draft.batch).toBe(8)
    expect(draft.warnings).toContain(
      "Jumlah part per nama tidak konsisten di salah satu plate — batch diambil dari jumlah terkecil, cek ulang manual.",
    )
  })
})

describe("buildKalkulasi3mfDraft — filament katalog match summary", () => {
  it("adds a warning listing how many filaments didn't match the katalog", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "test.gcode.3mf",
      slicePlates: SLICE_PLATES,
      modelPlates: MODEL_PLATES,
      filamentSlots: FILAMENT_SLOTS,
      filamentCatalog: [], // katalog kosong → semua filament unmatched
      printerProfiles: [],
    })
    expect(draft.warnings).toContain("3 dari 3 filament belum ke-match katalog, isi manual di part-nya.")
  })
})
