import type { WeldedMesh } from "../types"

const HEADER_BYTES = 84 // 80-byte header + uint32 triangle count
const TRI_BYTES = 50    // 12B normal + 36B vertices + 2B attr

/**
 * Parse binary STL into an indexed mesh, welding duplicate vertices.
 * Weld key quantizes to 1e-4 mm so bit-identical and near-identical
 * duplicates (typical STL output) collapse to one vertex.
 */
export function parseBinaryStl(buf: Buffer): WeldedMesh {
  if (buf.length < HEADER_BYTES) throw new Error("not a binary STL: too short")
  const triCount = buf.readUInt32LE(80)
  if (triCount === 0 || buf.length < HEADER_BYTES + triCount * TRI_BYTES) {
    throw new Error("not a binary STL: size mismatch with triangle count")
  }

  const keyToIndex = new Map<string, number>()
  const verts: number[] = []
  const triVerts = new Uint32Array(triCount * 3)

  for (let t = 0; t < triCount; t++) {
    const base = HEADER_BYTES + t * TRI_BYTES + 12 // skip normal
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(base + v * 12)
      const y = buf.readFloatLE(base + v * 12 + 4)
      const z = buf.readFloatLE(base + v * 12 + 8)
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
      let idx = keyToIndex.get(key)
      if (idx === undefined) {
        idx = verts.length / 3
        keyToIndex.set(key, idx)
        verts.push(x, y, z)
      }
      triVerts[t * 3 + v] = idx
    }
  }
  return { vertProperties: new Float32Array(verts), triVerts }
}

export function exportBinaryStl(mesh: WeldedMesh): Buffer {
  const triCount = mesh.triVerts.length / 3
  const buf = Buffer.alloc(HEADER_BYTES + triCount * TRI_BYTES)
  buf.write("ring-resizer binary STL", 0, "ascii")
  buf.writeUInt32LE(triCount, 80)

  const p = mesh.vertProperties
  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = [mesh.triVerts[t * 3], mesh.triVerts[t * 3 + 1], mesh.triVerts[t * 3 + 2]]
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2]
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2]
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2]
    // face normal = normalize((b-a) x (c-a))
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len

    const base = HEADER_BYTES + t * TRI_BYTES
    buf.writeFloatLE(nx, base); buf.writeFloatLE(ny, base + 4); buf.writeFloatLE(nz, base + 8)
    const coords = [ax, ay, az, bx, by, bz, cx, cy, cz]
    for (let i = 0; i < 9; i++) buf.writeFloatLE(coords[i], base + 12 + i * 4)
    // 2 attribute bytes stay zero
  }
  return buf
}

/** Uniform in-place scale around the origin. */
export function scaleMesh(mesh: WeldedMesh, factor: number): void {
  const p = mesh.vertProperties
  for (let i = 0; i < p.length; i++) p[i] *= factor
}

/**
 * In-place rotation around the origin, applied X, then Y, then Z (degrees,
 * right-hand rule, Z up). A proper rotation keeps triangle winding valid.
 */
export function rotateMesh(mesh: WeldedMesh, deg: [number, number, number]): void {
  const [ax, ay, az] = deg.map((d) => (d * Math.PI) / 180)
  const cx = Math.cos(ax), sx = Math.sin(ax)
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const cz = Math.cos(az), sz = Math.sin(az)
  // R = Rz * Ry * Rx
  const m = [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ]
  const p = mesh.vertProperties
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2]
    p[i] = m[0] * x + m[1] * y + m[2] * z
    p[i + 1] = m[3] * x + m[4] * y + m[5] * z
    p[i + 2] = m[6] * x + m[7] * y + m[8] * z
  }
}

/** Translate so the lowest vertex sits on the build plate (min Z = 0). */
export function dropToBed(mesh: WeldedMesh): void {
  const p = mesh.vertProperties
  let minZ = Infinity
  for (let i = 2; i < p.length; i += 3) if (p[i] < minZ) minZ = p[i]
  if (!Number.isFinite(minZ)) return
  for (let i = 2; i < p.length; i += 3) p[i] -= minZ
}

/** Test helper: axis-aligned cube [0,size]^3 as binary STL (12 tris). */
export function makeCubeStl(sizeMm: number): Buffer {
  const s = sizeMm
  // 8 corners
  const c = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ]
  // 12 triangles, outward winding (CCW seen from outside)
  const tris = [
    [0, 2, 1], [0, 3, 2], // bottom (z=0)
    [4, 5, 6], [4, 6, 7], // top (z=s)
    [0, 1, 5], [0, 5, 4], // front (y=0)
    [2, 3, 7], [2, 7, 6], // back (y=s)
    [1, 2, 6], [1, 6, 5], // right (x=s)
    [3, 0, 4], [3, 4, 7], // left (x=0)
  ]
  const buf = Buffer.alloc(HEADER_BYTES + tris.length * TRI_BYTES)
  buf.writeUInt32LE(tris.length, 80)
  tris.forEach((tri, t) => {
    const base = HEADER_BYTES + t * TRI_BYTES
    tri.forEach((vi, v) => {
      const [x, y, z] = c[vi]
      buf.writeFloatLE(x, base + 12 + v * 12)
      buf.writeFloatLE(y, base + 12 + v * 12 + 4)
      buf.writeFloatLE(z, base + 12 + v * 12 + 8)
    })
  })
  return buf
}
