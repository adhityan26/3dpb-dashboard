import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { readGcode3mfEntries, readPlateThumbnails } from "../read-zip"

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

describe("readPlateThumbnails", () => {
  it("ekstrak Metadata/plate_N.png (1-based) sebagai Blob, null kalau tidak ada", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config></config>",
      "Metadata/plate_1.png": "fake-png-bytes-1",
      "Metadata/plate_2.png": "fake-png-bytes-2",
    })
    const thumbs = await readPlateThumbnails(buf, 3)
    expect(thumbs).toHaveLength(3)
    expect(thumbs[0]).toBeInstanceOf(Blob)
    expect(thumbs[1]).toBeInstanceOf(Blob)
    expect(thumbs[2]).toBeNull() // plate_3.png tidak ada di ZIP
  })

  it("isi Blob-nya benar (round-trip)", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config></config>",
      "Metadata/plate_1.png": "fake-png-bytes-1",
    })
    const thumbs = await readPlateThumbnails(buf, 1)
    const text = await thumbs[0]!.text()
    expect(text).toBe("fake-png-bytes-1")
  })

  it("plateCount 0 → array kosong", async () => {
    const buf = await makeZip({ "Metadata/model_settings.config": "<config></config>" })
    expect(await readPlateThumbnails(buf, 0)).toEqual([])
  })

  it("ZIP corrupt → array berisi null sepanjang plateCount, tidak throw", async () => {
    const buf = new TextEncoder().encode("bukan zip").buffer
    const thumbs = await readPlateThumbnails(buf, 2)
    expect(thumbs).toEqual([null, null])
  })
})
