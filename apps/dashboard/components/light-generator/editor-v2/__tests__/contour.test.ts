import { describe, it, expect } from "vitest"
import { traceContour, contourToPath, type Point } from "../contour"

function grid(rows: string[]): { data: boolean[]; w: number; h: number } {
  const h = rows.length
  const w = rows[0].length
  const data: boolean[] = []
  for (const row of rows) {
    for (const ch of row) data.push(ch === "1")
  }
  return { data, w, h }
}

function bbox(points: Point[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe("traceContour", () => {
  it("blank grid returns empty", () => {
    const { data, w, h } = grid(["0000", "0000", "0000", "0000"])
    expect(traceContour(data, w, h)).toEqual([])
  })

  it("full solid square grid traces a rectangle covering the grid", () => {
    const { data, w, h } = grid(["1111", "1111", "1111", "1111"])
    const pts = traceContour(data, w, h)
    expect(pts.length).toBeGreaterThanOrEqual(4)
    const box = bbox(pts)
    expect(box.minX).toBe(0)
    expect(box.minY).toBe(0)
    expect(box.maxX).toBe(w - 1)
    expect(box.maxY).toBe(h - 1)
  })

  it("centered solid disk stays within expected radius band and closes", () => {
    const size = 20
    const cx = size / 2
    const cy = size / 2
    const radius = 8
    const rows: string[] = []
    for (let y = 0; y < size; y++) {
      let row = ""
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        row += Math.hypot(dx, dy) <= radius ? "1" : "0"
      }
      rows.push(row)
    }
    const { data, w, h } = grid(rows)
    const pts = traceContour(data, w, h)
    expect(pts.length).toBeGreaterThan(4)
    // closed: first and last points should be adjacent/equal to close the loop conceptually
    for (const p of pts) {
      const dx = p.x - cx
      const dy = p.y - cy
      const d = Math.hypot(dx, dy)
      expect(d).toBeLessThanOrEqual(radius + 1.5)
      expect(d).toBeGreaterThanOrEqual(radius - 1.5)
    }
  })

  it("L-shape contour contains a point near the inner (concave) corner", () => {
    // 6x6 grid, L-shape: top row band + left column band
    const rows = [
      "111100",
      "111100",
      "111100",
      "110000",
      "110000",
      "110000",
    ]
    const { data, w, h } = grid(rows)
    const pts = traceContour(data, w, h)
    expect(pts.length).toBeGreaterThanOrEqual(6)
    // The concave inner corner of this L sits at solid pixel (1, 3) — the
    // last column of the left-hand vertical band, first row past the top
    // band's bottom edge. Its presence in the boundary walk proves the
    // tracer hugged the notch instead of cutting across it.
    const hasNotchPoint = pts.some((p) => p.x === 1 && p.y === 3)
    expect(hasNotchPoint).toBe(true)
  })
})

describe("contourToPath", () => {
  it("formats a closed SVG path with scale/offset applied", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]
    const path = contourToPath(pts, 10, 5, 5)
    expect(path.startsWith("M 5.00,5.00 L")).toBe(true)
    expect(path.endsWith("Z")).toBe(true)
    expect(path).toContain("25.00,25.00")
  })

  it("empty for fewer than 3 points", () => {
    expect(contourToPath([], 1, 0, 0)).toBe("")
    expect(contourToPath([{ x: 0, y: 0 }], 1, 0, 0)).toBe("")
    expect(contourToPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1, 0, 0)).toBe("")
  })
})
