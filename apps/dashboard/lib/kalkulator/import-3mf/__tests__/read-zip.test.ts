import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { readGcode3mfEntries } from "../read-zip"

async function makeZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: "arraybuffer" })
}

describe("readGcode3mfEntries", () => {
  it("extracts the 3 metadata files and skips large .gcode entries", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config>model</config>",
      "Metadata/project_settings.config": "{}",
      "Metadata/slice_info.config": "<config>slice</config>",
      "Metadata/plate_1.gcode": "G1 X10\nG1 Y10\n", // shouldn't be read/needed
    })
    const result = await readGcode3mfEntries(buf)
    expect(result).toEqual({
      modelSettingsXml: "<config>model</config>",
      projectSettingsJson: "{}",
      sliceInfoXml: "<config>slice</config>",
    })
  })

  it("returns null-valued fields when a specific metadata file is missing (e.g. unsliced 3mf has no slice_info)", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config>model</config>",
      "Metadata/project_settings.config": "{}",
    })
    const result = await readGcode3mfEntries(buf)
    expect(result).toEqual({
      modelSettingsXml: "<config>model</config>",
      projectSettingsJson: "{}",
      sliceInfoXml: null,
    })
  })

  it("returns null when the archive has none of the expected Bambu Studio metadata files", async () => {
    const buf = await makeZip({ "readme.txt": "hello" })
    expect(await readGcode3mfEntries(buf)).toBeNull()
  })

  it("returns null for a corrupt/non-ZIP buffer", async () => {
    const buf = new TextEncoder().encode("not a zip file at all").buffer
    expect(await readGcode3mfEntries(buf)).toBeNull()
  })
})
