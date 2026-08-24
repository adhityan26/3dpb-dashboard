import { describe, it, expect } from "vitest"
import { computeScale } from "../sizing"

describe("computeScale", () => {
  // Parity with the existing GL2026 resize calculator HTML:
  // US 8 → circ 56.9mm, dia 18.112mm; +0.3 clearance → 18.412 / 23.871 = 0.77132…
  it("US size mode matches legacy calculator numbers", () => {
    const r = computeScale({ mode: "us", value: 8, clearanceMm: 0.3, baseBoreMm: 23.871 })
    expect(r.circMm).toBeCloseTo(56.9, 4)
    expect(r.targetDiaMm).toBeCloseTo(18.41183, 4)
    expect(r.scale).toBeCloseTo(0.7713055, 6)
    expect(r.usEquivalent).toBeCloseTo(8, 5)
  })

  it("diameter mode is identity on diameter", () => {
    const r = computeScale({ mode: "dia", value: 18.1, clearanceMm: 0, baseBoreMm: 23.871 })
    expect(r.targetDiaMm).toBeCloseTo(18.1, 6)
    expect(r.scale).toBeCloseTo(18.1 / 23.871, 6)
  })

  it("circumference mode converts via pi", () => {
    const r = computeScale({ mode: "circ", value: 57, clearanceMm: 0, baseBoreMm: 23.871 })
    expect(r.targetDiaMm).toBeCloseTo(57 / Math.PI, 6)
  })

  it("rejects non-positive input", () => {
    expect(() => computeScale({ mode: "us", value: 0, clearanceMm: 0.3, baseBoreMm: 23.871 })).toThrow()
    expect(() => computeScale({ mode: "dia", value: 18, clearanceMm: 0.3, baseBoreMm: 0 })).toThrow()
  })
})
