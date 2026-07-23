import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { import3mfFile } from "../index"

async function makeFile(name: string, files: Record<string, string>): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  const buf = await zip.generateAsync({ type: "arraybuffer" })
  return new File([buf], name)
}

const SLICE_INFO_XML = `<config><plate>
  <metadata key="index" value="1"/>
  <metadata key="printer_model_id" value="C12"/>
  <metadata key="prediction" value="3600"/>
  <metadata key="weight" value="10"/>
  <object identify_id="1" name="A" skipped="false" />
  <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="1" used_g="10"/>
</plate></config>`

const MODEL_SETTINGS_XML = `<config><plate>
  <metadata key="plater_id" value="1"/>
  <metadata key="plater_name" value="plate-1"/>
  <model_instance><metadata key="object_id" value="1"/><metadata key="identify_id" value="1"/></model_instance>
</plate></config>`

const PROJECT_SETTINGS_JSON = JSON.stringify({ filament_vendor: ["Bambu Lab"], filament_type: ["PLA"] })

describe("import3mfFile", () => {
  it("parses a full .gcode.3mf file end-to-end into a Kalkulasi3mfDraft", async () => {
    const file = await makeFile("My Print.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
      "Metadata/plate_1.png": "fake-png-bytes",
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.nama).toBe("My Print")
    expect(draft.isSliced).toBe(true)
    expect(draft.plates).toHaveLength(1)
    expect(draft.plates[0].gramasi).toBe(10)
    expect(draft.thumbnails).toHaveLength(1)
    expect(draft.thumbnails[0]).toBeInstanceOf(Blob)
  })

  it("plate tanpa Metadata/plate_N.png → thumbnails berisi null di index itu", async () => {
    const file = await makeFile("No Thumbnail.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.thumbnails).toEqual([null])
  })

  it("throws a user-facing error for a non-3MF ZIP", async () => {
    const file = await makeFile("random.zip", { "readme.txt": "hi" })
    await expect(import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })).rejects.toThrow(
      /bukan file 3MF|tidak dikenali/i,
    )
  })

  it("throws a user-facing error for a corrupt file", async () => {
    const file = new File([new TextEncoder().encode("garbage")], "broken.3mf")
    await expect(import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })).rejects.toThrow()
  })
})
