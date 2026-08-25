import { describe, it, expect } from "vitest"
import { buildTextSolid, loadEngraveFont } from "../mesh/text"

describe("buildTextSolid", () => {
  it("produces a positive-volume solid spanning 0..depth in Z, centered in X/Y", async () => {
    const solid = await buildTextSolid({
      text: "US 8", fontBuf: loadEngraveFont(), heightMm: 3, depthMm: 0.5,
    })
    expect(solid.volume()).toBeGreaterThan(0)
    const bb = solid.boundingBox()
    expect(bb.min[2]).toBeCloseTo(0, 5)
    expect(bb.max[2]).toBeCloseTo(0.5, 5)
    // centered: |min.x| ≈ |max.x|
    expect(Math.abs(bb.min[0] + bb.max[0])).toBeLessThan(0.1)
    // glyph height in the right ballpark (letters ≈ heightMm)
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(1.5)
    expect(bb.max[1] - bb.min[1]).toBeLessThan(6)
    solid.delete()
  })

  it("throws on characters missing from the font", async () => {
    await expect(
      buildTextSolid({ text: "日本語", fontBuf: loadEngraveFont(), heightMm: 3, depthMm: 0.5 }),
    ).rejects.toThrow()
  })
})
