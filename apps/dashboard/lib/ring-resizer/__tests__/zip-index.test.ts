import { describe, it, expect } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { zipEntryNamesFromTail, labelFromEntries } from "../zip-index"

function zipOf(names: string[], bodyBytes = 10): Buffer {
  const files: Record<string, Uint8Array> = {}
  for (const n of names) files[n] = strToU8("x".repeat(bodyBytes))
  return Buffer.from(zipSync(files, { level: 0 }))
}

describe("zipEntryNamesFromTail", () => {
  it("reads names from the whole archive", () => {
    const z = zipOf(["Ring_6.stl", "Stone_6.stl", "Frame_6.stl"])
    expect(zipEntryNamesFromTail(z, z.length)).toEqual(["Ring_6.stl", "Stone_6.stl", "Frame_6.stl"])
  })

  it("reads names from only the tail of a large archive", () => {
    const z = zipOf(["Ring_7.5.stl", "Frame_7.5.stl"], 200_000)
    const tail = z.subarray(z.length - 4096)
    expect(zipEntryNamesFromTail(tail, z.length)).toEqual(["Ring_7.5.stl", "Frame_7.5.stl"])
  })

  it("returns [] for non-zip data or a truncated central directory", () => {
    expect(zipEntryNamesFromTail(Buffer.alloc(100), 100)).toEqual([])
    const z = zipOf(["a.stl", "b.stl"])
    const tail = z.subarray(z.length - 40) // EOCD only, CD cut off
    expect(zipEntryNamesFromTail(tail, z.length)).toEqual([])
  })
})

describe("labelFromEntries", () => {
  it("returns the shared size label", () => {
    expect(labelFromEntries(["Ring_7.5.stl", "Stone_7.5.stl"])).toBe("7.5")
  })
  it("null when labels differ or entries are empty", () => {
    expect(labelFromEntries(["Ring_7.stl", "Stone_8.stl"])).toBeNull()
    expect(labelFromEntries([])).toBeNull()
  })
})
