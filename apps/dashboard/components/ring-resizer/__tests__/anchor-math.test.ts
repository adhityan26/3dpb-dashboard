import { describe, it, expect } from "vitest"
import { defaultUp, rotateUp } from "../anchor-math"

const len = (v: readonly number[]) => Math.hypot(...v)
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe("defaultUp", () => {
  it("returns a unit vector perpendicular to the normal", () => {
    for (const n of [[0, 0, 1], [1, 0, 0], [0.577, 0.577, 0.577]] as const) {
      const up = defaultUp([...n] as [number, number, number])
      expect(len(up)).toBeCloseTo(1, 5)
      expect(Math.abs(dot(up, n))).toBeLessThan(1e-6)
    }
  })
})

describe("rotateUp", () => {
  it("rotating 90° around +Z maps +Y to -X", () => {
    const r = rotateUp([0, 0, 1], [0, 1, 0], 90)
    expect(r[0]).toBeCloseTo(-1, 5)
    expect(r[1]).toBeCloseTo(0, 5)
  })

  it("stays perpendicular to the normal for any angle", () => {
    const n: [number, number, number] = [0.267, 0.535, 0.802]
    const up = defaultUp(n)
    for (const deg of [30, 123, 270]) {
      expect(Math.abs(dot(rotateUp(n, up, deg), n))).toBeLessThan(1e-5)
    }
  })
})
