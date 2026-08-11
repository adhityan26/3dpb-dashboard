import { describe, expect, it } from "vitest"
import { isPristinePlate, mergeImportedPlates } from "../merge-plates"

const empty = { tipe: "FDM" as const, gramasi: 0, durasiJam: 0 }
const filled = { namaPart: "Body", tipe: "FDM" as const, gramasi: 120, durasiJam: 2.5 }

describe("isPristinePlate (dashboard)", () => {
  it("DEFAULT_PLATE-shaped row is pristine", () => {
    expect(isPristinePlate(empty)).toBe(true)
  })
  it("filled duration → not pristine", () => {
    expect(isPristinePlate({ ...empty, durasiJam: 1 })).toBe(false)
  })
  it("filled gramasi → not pristine", () => {
    expect(isPristinePlate({ ...empty, gramasi: 5 })).toBe(false)
  })
  it("filled namaPart → not pristine", () => {
    expect(isPristinePlate({ ...empty, namaPart: "x" })).toBe(false)
  })
  it("multi-material with any weight → not pristine", () => {
    expect(isPristinePlate({ ...empty, materials: [{ id: 1, material: "PLA", color: "", gramasi: 3 }] })).toBe(false)
  })
})

describe("mergeImportedPlates (dashboard)", () => {
  it("pristine state: placeholder replaced, wasPristine true", () => {
    const { plates, wasPristine } = mergeImportedPlates([empty], [filled])
    expect(plates).toEqual([filled])
    expect(wasPristine).toBe(true)
  })
  it("filled state: imported plates appended, wasPristine false", () => {
    const other = { ...filled, namaPart: "Lid" }
    const { plates, wasPristine } = mergeImportedPlates([filled], [other])
    expect(plates).toEqual([filled, other])
    expect(wasPristine).toBe(false)
  })
  it("pristine row among filled rows is dropped on append", () => {
    const other = { ...filled, namaPart: "Lid" }
    const { plates } = mergeImportedPlates([filled, empty], [other])
    expect(plates).toEqual([filled, other])
  })
})
