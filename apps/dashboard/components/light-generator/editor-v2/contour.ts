/**
 * Pure contour tracing for the custom-flooring casing overlay. Given a
 * binary grid (solid/background), finds the outer boundary of the LARGEST
 * connected solid region and returns it as a closed polygon of PIXEL
 * coordinates (each point is a solid pixel on the region's outer edge, so
 * the polygon traces the actual outline — e.g. a shield silhouette —
 * instead of a bounding box).
 *
 * No DOM/canvas dependency here on purpose: this module is pure math so it
 * can be unit tested without jsdom/canvas mocking. LgCanvas2D is responsible
 * for turning an <img> into a grid (via an offscreen canvas) and feeding it
 * in.
 */

export interface Point {
  x: number
  y: number
}

/** Flood-fills from every unvisited solid cell to find connected components,
 * returning the cell indices (row-major, `y * w + x`) of the LARGEST one. */
function largestComponent(solid: (i: number) => boolean, w: number, h: number): Set<number> {
  const n = w * h
  const visited = new Uint8Array(n)
  let best: number[] = []
  const stack: number[] = []
  for (let start = 0; start < n; start++) {
    if (visited[start] || !solid(start)) continue
    const component: number[] = []
    stack.length = 0
    stack.push(start)
    visited[start] = 1
    while (stack.length) {
      const i = stack.pop() as number
      component.push(i)
      const x = i % w
      const y = (i - x) / w
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (visited[ni] || !solid(ni)) continue
        visited[ni] = 1
        stack.push(ni)
      }
    }
    if (component.length > best.length) best = component
  }
  return new Set(best)
}

// Clockwise 8-connected neighbor offsets starting at North, used by the
// Moore-neighbor boundary-following walk below.
const OFFSETS: Array<[number, number]> = [
  [0, -1], // N
  [1, -1], // NE
  [1, 0], // E
  [1, 1], // SE
  [0, 1], // S
  [-1, 1], // SW
  [-1, 0], // W
  [-1, -1], // NW
]

function offsetIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) {
    if (OFFSETS[i][0] === dx && OFFSETS[i][1] === dy) return i
  }
  return 0
}

/**
 * Traces the outer contour of the largest solid region via Moore-neighbor
 * boundary tracing (Jacob's stopping criterion): starting from the
 * topmost-leftmost solid pixel, repeatedly walks clockwise around the
 * 8-neighborhood of the current boundary pixel (starting the search just
 * past the last background pixel visited) to find the next boundary pixel.
 * This hugs concave notches correctly since it never cuts corners.
 *
 * Returns pixel coordinates (0..w-1, 0..h-1) of the boundary walk, in
 * order, decimated to drop collinear runs. Empty for a blank grid or a
 * single isolated pixel with no other solid neighbors.
 */
export function traceContour(grid: Uint8Array | boolean[], w: number, h: number): Point[] {
  if (w <= 0 || h <= 0) return []
  const solidAt = (i: number) => !!grid[i]
  const component = largestComponent(solidAt, w, h)
  if (component.size === 0) return []
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && component.has(y * w + x)

  // Topmost, then leftmost, solid pixel — guarantees the pixel immediately
  // to its west is background (or off-grid), giving a stable start
  // direction for the walk.
  let start: Point | null = null
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        start = { x, y }
        break outer
      }
    }
  }
  if (!start) return []

  const initialBack: Point = { x: start.x - 1, y: start.y }

  // Single isolated solid pixel (no solid neighbor at all): return a tiny
  // 1x1 square around it rather than an empty/degenerate result.
  let hasSolidNeighbor = false
  for (const [dx, dy] of OFFSETS) {
    if (solid(start.x + dx, start.y + dy)) {
      hasSolidNeighbor = true
      break
    }
  }
  if (!hasSolidNeighbor) return [start]

  const boundary: Point[] = [start]
  let current = start
  let back = initialBack
  const maxSteps = w * h * 8 + 16
  let guard = 0

  while (guard++ < maxSteps) {
    const searchStart = offsetIndex(back.x - current.x, back.y - current.y)
    let found: Point | null = null
    let lastBackground = back
    for (let step = 1; step <= 8; step++) {
      const idx = (searchStart + step) % 8
      const [dx, dy] = OFFSETS[idx]
      const nx = current.x + dx
      const ny = current.y + dy
      if (solid(nx, ny)) {
        found = { x: nx, y: ny }
        break
      }
      lastBackground = { x: nx, y: ny }
    }
    if (!found) break
    const newBack = lastBackground
    current = found
    back = newBack
    // Jacob's stopping criterion: stop once we re-enter the start pixel via
    // the same backtrack direction that began the walk (i.e. the loop has
    // fully closed), rather than merely visiting it once.
    if (current.x === start.x && current.y === start.y && back.x === initialBack.x && back.y === initialBack.y) {
      break
    }
    boundary.push(current)
  }

  return decimateCollinear(boundary)
}

/** Drops interior points that lie on the same straight segment as their
 * neighbors (three consecutive collinear points -> drop the middle one). */
function decimateCollinear(points: Point[]): Point[] {
  if (points.length < 3) return points
  const out: Point[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    const cross = (cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x)
    if (cross !== 0) out.push(cur)
  }
  return out.length >= 3 ? out : points
}

/** Renders a traced contour polygon (grid/pixel coords) as an SVG path,
 * scaled and offset into screen space. Empty string for degenerate input
 * (<3 points). */
export function contourToPath(points: Point[], scale: number, offsetX: number, offsetY: number): string {
  if (points.length < 3) return ""
  const toScreen = (p: Point) => `${(p.x * scale + offsetX).toFixed(2)},${(p.y * scale + offsetY).toFixed(2)}`
  const [first, ...rest] = points
  return `M ${toScreen(first)} L ${rest.map(toScreen).join(" L ")} Z`
}
