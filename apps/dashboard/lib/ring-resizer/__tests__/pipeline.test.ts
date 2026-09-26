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

describe("processPart rotation", () => {
  const bounds = (stl: Buffer) => {
    const p = parseBinaryStl(stl).vertProperties
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < p.length; i++) {
      min[i % 3] = Math.min(min[i % 3], p[i]); max[i % 3] = Math.max(max[i % 3], p[i])
    }
    return { min, max }
  }
  it("rotates 90° around X and drops the part onto the bed", async () => {
    const r = await processPart({
      stl: makeCubeStl(20), scale: 1, anchors: [], text: "", rotationDeg: [90, 0, 0],
    })
    const { min, max } = bounds(r.stl)
    // cube [0,20]^3 rotated +90° about X → y∈[-20,0], z∈[0,20]; already on bed
    expect(min[1]).toBeCloseTo(-20, 3); expect(max[1]).toBeCloseTo(0, 3)
    expect(min[2]).toBeCloseTo(0, 3); expect(max[2]).toBeCloseTo(20, 3)
  })

  it("lifts parts that end up below the bed", async () => {
    const r = await processPart({
      stl: makeCubeStl(20), scale: 1, anchors: [], text: "", rotationDeg: [180, 0, 0],
    })
    const { min, max } = bounds(r.stl)
    expect(min[2]).toBeCloseTo(0, 3); expect(max[2]).toBeCloseTo(20, 3)
  })

  it("zero rotation leaves coordinates untouched", async () => {
    const r = await processPart({
      stl: makeCubeStl(20), scale: 1, anchors: [], text: "", rotationDeg: [0, 0, 360],
    })
    const { min, max } = bounds(r.stl)
    expect(min).toEqual([0, 0, 0]); expect(max).toEqual([20, 20, 20])
  })
})

describe("sanitizeLabel", () => {
  it("keeps safe chars, replaces the rest", () => {
    // space, "/", space, "#" each become "_": "US 8 / #1234" → "US_8____1234"
    expect(sanitizeLabel("US 8 / #1234")).toBe("US_8____1234")
    expect(sanitizeLabel("band.stl")).toBe("band.stl")
  })
})
