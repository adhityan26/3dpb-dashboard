import type { WeldedMesh } from "../types"

// Auto-detection of a ring part's inner (bore) diameter.
//
// Method: PCA over the welded vertices finds the hole axis (the direction with
// the least positional variance for a band-like shape). Vertices are projected
// onto the plane perpendicular to that axis; the innermost shell of points is
// selected and a least-squares (Kasa) circle is fitted, twice — the second
// pass re-centers the selection so a bulky one-sided decoration cannot bias
// the fit through the centroid. Sanity gates reject solids without a hole.

const MIN_BORE_MM = 5
const MAX_BORE_MM = 40
const SHELL_MM = 0.3 // radial thickness of the "inner wall" vertex shell
const MIN_SHELL_POINTS = 32
const MAX_MEAN_RESIDUAL_MM = 0.3
const MIN_ANGULAR_BINS = 8 // of 12 — inner wall must wrap most of the circle
const MAX_SAMPLES = 120_000

type V3 = [number, number, number]

/** Eigen decomposition of a symmetric 3x3 matrix via cyclic Jacobi. */
function symmetricEigen(m: number[][]): { values: number[]; vectors: V3[] } {
  const a = m.map((row) => row.slice())
  let v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q]
    if (off < 1e-18) break
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        v = v.map((row) => {
          const rp = row[p], rq = row[q]
          const nr = row.slice()
          nr[p] = c * rp - s * rq
          nr[q] = s * rp + c * rq
          return nr
        })
      }
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ],
  }
}

/** Kasa least-squares circle fit. Returns center + radius. */
function fitCircle(pts: Array<[number, number]>): { cx: number; cy: number; r: number } {
  // Solve [u v 1][a b c]^T = u^2+v^2 in least squares; center = (a/2, b/2).
  let suu = 0, suv = 0, svv = 0, su = 0, sv = 0, n = pts.length
  let suw = 0, svw = 0, sw = 0
  for (const [u, vv] of pts) {
    const w = u * u + vv * vv
    suu += u * u; suv += u * vv; svv += vv * vv
    su += u; sv += vv
    suw += u * w; svw += vv * w; sw += w
  }
  // Normal equations for A x = b, A = [[suu,suv,su],[suv,svv,sv],[su,sv,n]]
  const A = [
    [suu, suv, su],
    [suv, svv, sv],
    [su, sv, n],
  ]
  const b = [suw, svw, sw]
  // Gaussian elimination (3x3)
  for (let i = 0; i < 3; i++) {
    let piv = i
    for (let j = i + 1; j < 3; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j
    ;[A[i], A[piv]] = [A[piv], A[i]]
    ;[b[i], b[piv]] = [b[piv], b[i]]
    const d = A[i][i] || 1e-12
    for (let j = i + 1; j < 3; j++) {
      const f = A[j][i] / d
      for (let k = i; k < 3; k++) A[j][k] -= f * A[i][k]
      b[j] -= f * b[i]
    }
  }
  const x = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let s = b[i]
    for (let k = i + 1; k < 3; k++) s -= A[i][k] * x[k]
    x[i] = s / (A[i][i] || 1e-12)
  }
  const cx = x[0] / 2
  const cy = x[1] / 2
  const r = Math.sqrt(Math.max(0, x[2] + cx * cx + cy * cy))
  return { cx, cy, r }
}

function innerShellFit(
  pts: Array<[number, number]>,
  cx: number,
  cy: number,
): { fit: { cx: number; cy: number; r: number }; shell: Array<[number, number]> } | null {
  let rmin = Infinity
  const dists = new Float64Array(pts.length)
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - cx, pts[i][1] - cy)
    dists[i] = d
    if (d < rmin) rmin = d
  }
  const shell: Array<[number, number]> = []
  for (let i = 0; i < pts.length; i++) {
    if (dists[i] <= rmin + SHELL_MM) shell.push(pts[i])
  }
  if (shell.length < MIN_SHELL_POINTS) return null
  return { fit: fitCircle(shell), shell }
}

/**
 * Detect the bore (inner hole) diameter of a mesh in mm.
 * Returns null when no plausible hole is found.
 */
export function detectBoreMm(mesh: WeldedMesh): number | null {
  const p = mesh.vertProperties
  const total = p.length / 3
  if (total < MIN_SHELL_POINTS) return null
  const stride = Math.max(1, Math.floor(total / MAX_SAMPLES))

  // Centroid
  let mx = 0, my = 0, mz = 0, n = 0
  for (let i = 0; i < total; i += stride) {
    mx += p[i * 3]; my += p[i * 3 + 1]; mz += p[i * 3 + 2]; n++
  }
  mx /= n; my /= n; mz /= n

  // Covariance
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0
  for (let i = 0; i < total; i += stride) {
    const dx = p[i * 3] - mx, dy = p[i * 3 + 1] - my, dz = p[i * 3 + 2] - mz
    cxx += dx * dx; cxy += dx * dy; cxz += dx * dz
    cyy += dy * dy; cyz += dy * dz; czz += dz * dz
  }
  const cov = [
    [cxx / n, cxy / n, cxz / n],
    [cxy / n, cyy / n, cyz / n],
    [cxz / n, cyz / n, czz / n],
  ]
  const { values, vectors } = symmetricEigen(cov)
  let axisIdx = 0
  for (let i = 1; i < 3; i++) if (values[i] < values[axisIdx]) axisIdx = i
  const axis = vectors[axisIdx]
  const al = Math.hypot(...axis) || 1
  const az: V3 = [axis[0] / al, axis[1] / al, axis[2] / al]

  // Orthonormal basis (u, v) perpendicular to the axis
  const ref: V3 = Math.abs(az[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const ux = ref[1] * az[2] - ref[2] * az[1]
  const uy = ref[2] * az[0] - ref[0] * az[2]
  const uz = ref[0] * az[1] - ref[1] * az[0]
  const ul = Math.hypot(ux, uy, uz) || 1
  const u: V3 = [ux / ul, uy / ul, uz / ul]
  const v: V3 = [
    az[1] * u[2] - az[2] * u[1],
    az[2] * u[0] - az[0] * u[2],
    az[0] * u[1] - az[1] * u[0],
  ]

  // Project onto the (u, v) plane, relative to the centroid
  const pts: Array<[number, number]> = []
  for (let i = 0; i < total; i += stride) {
    const dx = p[i * 3] - mx, dy = p[i * 3 + 1] - my, dz = p[i * 3 + 2] - mz
    pts.push([dx * u[0] + dy * u[1] + dz * u[2], dx * v[0] + dy * v[1] + dz * v[2]])
  }

  // Pass 1: shell around the centroid; Pass 2: re-centered on the pass-1 fit
  const pass1 = innerShellFit(pts, 0, 0)
  if (!pass1) return null
  const pass2 = innerShellFit(pts, pass1.fit.cx, pass1.fit.cy)
  if (!pass2) return null
  const { cx, cy, r } = pass2.fit

  // Fit quality: the shell must actually lie on the fitted circle
  let residual = 0
  for (const [x, y] of pass2.shell) residual += Math.abs(Math.hypot(x - cx, y - cy) - r)
  residual /= pass2.shell.length
  if (residual > MAX_MEAN_RESIDUAL_MM) return null

  // The inner wall must wrap most of the circle (rejects arcs/edges of solids)
  const bins = new Array(12).fill(0)
  for (const [x, y] of pass2.shell) {
    const ang = Math.atan2(y - cy, x - cx)
    bins[Math.min(11, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 12))]++
  }
  if (bins.filter((c) => c > 0).length < MIN_ANGULAR_BINS) return null

  const dia = 2 * r
  if (dia < MIN_BORE_MM || dia > MAX_BORE_MM) return null
  return dia
}

// ── Test fixture ──────────────────────────────────────────────────────────────

const HEADER_BYTES = 84
const TRI_BYTES = 50

/**
 * Test helper: annular prism (ring band) as binary STL. Options allow a bulky
 * one-sided outer bump (asymmetry) and a tilt off the Z axis.
 */
export function makeRingStl(opts: {
  innerDiaMm: number
  outerDiaMm: number
  heightMm: number
  segments?: number
  bumpOuterDiaMm?: number
  tiltDeg?: number
}): Buffer {
  const { innerDiaMm, outerDiaMm, heightMm } = opts
  const segments = opts.segments ?? 96
  const ri = innerDiaMm / 2
  const h = heightMm
  const tilt = ((opts.tiltDeg ?? 0) * Math.PI) / 180
  const ct = Math.cos(tilt), st = Math.sin(tilt)

  const outerR = (angle: number): number => {
    // bump occupies the 90° sector centered on angle 0
    if (opts.bumpOuterDiaMm && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < Math.PI / 4) {
      return opts.bumpOuterDiaMm / 2
    }
    return outerDiaMm / 2
  }

  type P = [number, number, number]
  const rot = ([x, y, z]: P): P => [x, y * ct - z * st, y * st + z * ct]
  const tris: Array<[P, P, P]> = []
  const quad = (a: P, b: P, c: P, d: P) => {
    tris.push([a, b, c], [a, c, d])
  }

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI
    const a1 = ((i + 1) / segments) * 2 * Math.PI
    const ro0 = outerR(a0), ro1 = outerR(a1)
    const i0b: P = [ri * Math.cos(a0), ri * Math.sin(a0), 0]
    const i1b: P = [ri * Math.cos(a1), ri * Math.sin(a1), 0]
    const i0t: P = [i0b[0], i0b[1], h]
    const i1t: P = [i1b[0], i1b[1], h]
    const o0b: P = [ro0 * Math.cos(a0), ro0 * Math.sin(a0), 0]
    const o1b: P = [ro1 * Math.cos(a1), ro1 * Math.sin(a1), 0]
    const o0t: P = [o0b[0], o0b[1], h]
    const o1t: P = [o1b[0], o1b[1], h]
    quad(i0b, i1b, i1t, i0t) // inner wall
    quad(o0b, o0t, o1t, o1b) // outer wall
    quad(i0t, i1t, o1t, o0t) // top
    quad(i0b, o0b, o1b, i1b) // bottom
  }

  const buf = Buffer.alloc(HEADER_BYTES + tris.length * TRI_BYTES)
  buf.writeUInt32LE(tris.length, 80)
  tris.forEach((tri, t) => {
    const base = HEADER_BYTES + t * TRI_BYTES
    tri.forEach((pt, vi) => {
      const [x, y, z] = rot(pt)
      buf.writeFloatLE(x, base + 12 + vi * 12)
      buf.writeFloatLE(y, base + 12 + vi * 12 + 4)
      buf.writeFloatLE(z, base + 12 + vi * 12 + 8)
    })
  })
  return buf
}
