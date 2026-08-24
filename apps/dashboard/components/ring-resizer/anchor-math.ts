// Pure vector math for anchor placement — kept out of the r3f component so it
// is testable in the node test environment.

export type V3 = [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

/** World axis least parallel to the normal, projected onto the surface plane. */
export function defaultUp(normal: V3): V3 {
  const n = norm(normal)
  const candidates: V3[] = [[0, 0, 1], [0, 1, 0], [1, 0, 0]]
  let best: V3 = candidates[0]
  let bestAbs = 2
  for (const c of candidates) {
    const d = Math.abs(dot(c, n))
    if (d < bestAbs) { bestAbs = d; best = c }
  }
  return norm(sub(best, scale(n, dot(best, n))))
}

/** Rodrigues rotation of `up` around `normal` by `degrees`. */
export function rotateUp(normal: V3, up: V3, degrees: number): V3 {
  const n = norm(normal)
  const rad = (degrees * Math.PI) / 180
  const c = Math.cos(rad), s = Math.sin(rad)
  const term1 = scale(up, c)
  const term2 = scale(cross(n, up), s)
  const term3 = scale(n, dot(n, up) * (1 - c))
  return norm([term1[0] + term2[0] + term3[0], term1[1] + term2[1] + term3[1], term1[2] + term2[2] + term3[2]])
}
