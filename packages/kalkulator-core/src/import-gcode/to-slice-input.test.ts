import { describe, it, expect } from "vitest"
import { gcodeSummaryToSliceInput } from "./to-slice-input"
import type { GcodeSummary } from "./types"

const summary: GcodeSummary = {
  slicer: "bambu",
  totalSec: 46368,
  filaments: [
    { index: 1, usedG: 58.16, type: "PLA", color: "#D90000", vendor: "Generic" },
    { index: 3, usedG: 33.48, type: "PETG", color: "#00FF00", vendor: "Bambu Lab" },
  ],
  printerModel: "Bambu Lab P1S",
}

describe("gcodeSummaryToSliceInput", () => {
  it("builds one sliced plate with batch-1 object counts", () => {
    const { slicePlate } = gcodeSummaryToSliceInput(summary)
    expect(slicePlate).toEqual({
      index: 1,
      weightG: 91.64,
      predictionSec: 46368,
      printerModelId: null,
      objectCount: 1,
      partCount: 1,
      partCountConsistent: true,
      filaments: [
        { id: 1, type: "PLA", color: "#D90000", usedG: 58.16 },
        { id: 3, type: "PETG", color: "#00FF00", usedG: 33.48 },
      ],
    })
  })

  it("places filament slots at index-1 and fills gaps", () => {
    const { filamentSlots } = gcodeSummaryToSliceInput(summary)
    expect(filamentSlots).toEqual([
      { vendor: "Generic", type: "PLA" },
      { vendor: "", type: "" },
      { vendor: "Bambu Lab", type: "PETG" },
    ])
  })

  it("defaults missing type/color/vendor to empty strings", () => {
    const { slicePlate, filamentSlots } = gcodeSummaryToSliceInput({
      slicer: "orca", totalSec: 60, filaments: [{ index: 1, usedG: 2 }],
    })
    expect(slicePlate.filaments[0]).toEqual({ id: 1, type: "", color: "", usedG: 2 })
    expect(filamentSlots).toEqual([{ vendor: "", type: "" }])
  })
})
