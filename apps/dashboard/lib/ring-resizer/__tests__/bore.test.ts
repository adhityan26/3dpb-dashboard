import { describe, it, expect } from "vitest"
import { parseBinaryStl, makeCubeStl } from "../mesh/stl"
import { detectBoreMm, makeRingStl, makeCylinderStl } from "../mesh/bore"

describe("detectBoreMm", () => {
  it("detects the inner diameter of a plain ring band", () => {
    const mesh = parseBinaryStl(makeRingStl({ innerDiaMm: 23.871, outerDiaMm: 30, heightMm: 12 }))
    const bore = detectBoreMm(mesh)
    expect(bore).not.toBeNull()
    expect(bore!).toBeCloseTo(23.871, 1)
  })

  it("is robust to a large one-sided decoration (asymmetric centroid)", () => {
    // ring with a bulky outer bump on one side — centroid shifts, bore must not
    const mesh = parseBinaryStl(
      makeRingStl({ innerDiaMm: 18, outerDiaMm: 24, heightMm: 10, bumpOuterDiaMm: 44 }),
    )
    const bore = detectBoreMm(mesh)
    expect(bore).not.toBeNull()
    expect(bore!).toBeCloseTo(18, 1)
  })

  it("detects when the ring axis is not Z-aligned", () => {
    const mesh = parseBinaryStl(
      makeRingStl({ innerDiaMm: 20, outerDiaMm: 26, heightMm: 14, tiltDeg: 35 }),
    )
    const bore = detectBoreMm(mesh)
    expect(bore).not.toBeNull()
    expect(bore!).toBeCloseTo(20, 1)
  })

  it("returns null for a solid part with no hole", () => {
    const mesh = parseBinaryStl(makeCubeStl(20))
    expect(detectBoreMm(mesh)).toBeNull()
  })

  it("returns null for a smooth solid cylinder whose OUTER surface would fit a plausible circle", () => {
    // regression: without the annulus gate this detects the outer wall (20mm)
    // as a perfect "bore" and could silently auto-set a model's scale
    const mesh = parseBinaryStl(makeCylinderStl(20, 12))
    expect(detectBoreMm(mesh)).toBeNull()
  })

  it("returns null for an implausibly small hole", () => {
    const mesh = parseBinaryStl(makeRingStl({ innerDiaMm: 2, outerDiaMm: 8, heightMm: 5 }))
    expect(detectBoreMm(mesh)).toBeNull()
  })
})
