import { describe, it, expect } from "vitest"
import { makeCubeStl, parseBinaryStl } from "../mesh/stl"
import { processPart, sanitizeLabel } from "../mesh/pipeline"
import type { AnchorInput } from "../types"

const anchor: AnchorInput = {
  pos: [10, 10, 20], normal: [0, 0, 1], up: [0, 1, 0], textHeightMm: 4, depthMm: 0.5,
}

describe("processPart", () => {
  it("scales exactly and engraves", async () => {
    const r = await processPart({ stl: makeCubeStl(20), scale: 0.75, anchors: [anchor], text: "US 8" })
    expect(r.engraved).toBe(true)
    const mesh = parseBinaryStl(r.stl)
    const maxCoord = Math.max(...mesh.vertProperties)
    expect(maxCoord).toBeCloseTo(15, 3) // 20 * 0.75
  })

  it("without anchors returns scaled-only, engraved=false", async () => {
    const r = await processPart({ stl: makeCubeStl(20), scale: 0.5, anchors: [], text: "US 8" })
    expect(r.engraved).toBe(false)
    const mesh = parseBinaryStl(r.stl)
    expect(Math.max(...mesh.vertProperties)).toBeCloseTo(10, 3)
  })
})

describe("sanitizeLabel", () => {
  it("keeps safe chars, replaces the rest", () => {
    // space, "/", space, "#" each become "_": "US 8 / #1234" → "US_8____1234"
    expect(sanitizeLabel("US 8 / #1234")).toBe("US_8____1234")
    expect(sanitizeLabel("band.stl")).toBe("band.stl")
  })
})
