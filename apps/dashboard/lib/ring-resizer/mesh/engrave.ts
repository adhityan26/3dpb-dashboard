import * as THREE from "three"
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg"
import type { Manifold, Mat4 } from "manifold-3d"
import type { AnchorInput, WeldedMesh } from "../types"
import { getManifold } from "./manifold"
import { buildTextSolid } from "./text"

const OUTSET_MM = 0.6 // cutter sticks out past the surface to guarantee a clean cut

type V3 = [number, number, number]
const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]

/**
 * Column-major 4x4 (matches manifold-3d's Mat4 layout — see manifold.d.ts:
 * "4x4 matrix stored in column-major order", and Manifold.transform()'s
 * doc: "Stored in column-major order") placing the text solid on the
 * (scaled) surface point: local X = right, local Y = text up, local Z =
 * surface normal.
 */
export function anchorMatrix(anchor: AnchorInput, scale: number): number[] {
  const n = norm(anchor.normal)
  const x = norm(cross(anchor.up, n))
  const y = cross(n, x) // already unit: n ⟂ x
  const p = anchor.pos
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    n[0], n[1], n[2], 0,
    p[0] * scale, p[1] * scale, p[2] * scale, 1,
  ]
}

async function buildCutters(anchors: AnchorInput[], text: string, fontBuf: Buffer, scale: number): Promise<Manifold> {
  // getManifold() is memoized (see ./manifold), and buildTextSolid() already
  // awaits it internally, so no separate warm-up call is needed here.
  let union: Manifold | null = null
  for (const a of anchors) {
    // extrude depth + outset, then sink so it spans z ∈ [-depth, +outset] locally
    const solid = await buildTextSolid({
      text, fontBuf, heightMm: a.textHeightMm, depthMm: a.depthMm + OUTSET_MM,
    })
    const sunk = solid.translate([0, 0, -a.depthMm])
    solid.delete()
    // anchorMatrix's public return type is number[] per the interface, but
    // manifold-3d's transform() expects the fixed-length Mat4 tuple; the
    // array is always exactly 16 numbers so this narrowing is safe.
    const placed = sunk.transform(anchorMatrix(a, scale) as unknown as Mat4)
    sunk.delete()
    if (!union) union = placed
    else {
      // explicit annotation avoids TS7022 (circular inference) from
      // reassigning `union` from a value derived by calling a method on it
      const u: Manifold = union.add(placed)
      union.delete(); placed.delete(); union = u
    }
  }
  if (!union) throw new Error("no anchors")
  return union
}

function weldedToGeometry(mesh: WeldedMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.BufferAttribute(mesh.vertProperties.slice(), 3))
  g.setIndex(new THREE.BufferAttribute(mesh.triVerts.slice(), 1))
  g.computeVertexNormals()
  return g
}

function geometryToWelded(g: THREE.BufferGeometry): WeldedMesh {
  const pos = g.getAttribute("position") as THREE.BufferAttribute
  const idx = g.getIndex()
  const vertProperties = new Float32Array(pos.array as ArrayLike<number>)
  const triVerts = idx
    ? new Uint32Array(idx.array as ArrayLike<number>)
    : new Uint32Array(Array.from({ length: pos.count }, (_, i) => i))
  return { vertProperties, triVerts }
}

/**
 * Engrave `text` at every anchor of an ALREADY-SCALED base mesh.
 * Ladder: manifold-3d (exact, watertight) → three-bvh-csg (tolerant) →
 * give up and return the scaled base with a warning.
 */
export async function engraveWelded(opts: {
  base: WeldedMesh
  anchors: AnchorInput[]
  text: string
  fontBuf: Buffer
  scale: number
}): Promise<{ mesh: WeldedMesh; engraved: boolean; warning?: string }> {
  const { base, anchors, text, fontBuf, scale } = opts
  if (anchors.length === 0 || text.trim() === "") {
    return { mesh: base, engraved: false }
  }

  const wasm = await getManifold()
  const cutters = await buildCutters(anchors, text, fontBuf, scale)

  // Rung 1: manifold
  try {
    const m = new wasm.Mesh({ numProp: 3, vertProperties: base.vertProperties, triVerts: base.triVerts })
    m.merge()
    const solid = new wasm.Manifold(m)
    const result = solid.subtract(cutters)
    solid.delete()
    const out = result.getMesh()
    result.delete(); cutters.delete()
    return {
      mesh: { vertProperties: new Float32Array(out.vertProperties), triVerts: new Uint32Array(out.triVerts) },
      engraved: true,
    }
  } catch {
    // fall through to csg
  }

  // Rung 2: three-bvh-csg on the raw triangle soup
  try {
    const cutterMesh = cutters.getMesh()
    cutters.delete()
    const baseBrush = new Brush(weldedToGeometry(base))
    const cutterBrush = new Brush(weldedToGeometry({
      vertProperties: new Float32Array(cutterMesh.vertProperties),
      triVerts: new Uint32Array(cutterMesh.triVerts),
    }))
    baseBrush.updateMatrixWorld(); cutterBrush.updateMatrixWorld()
    const evaluator = new Evaluator()
    // Evaluator defaults to ['position', 'uv', 'normal'] and throws
    // ("Cannot read properties of undefined (reading 'array')") if any
    // brush geometry lacks one of those attributes. weldedToGeometry only
    // produces position + computed normal (no UV — engrave meshes are not
    // textured), so restrict the evaluator to the attributes we actually have.
    evaluator.attributes = ["position", "normal"]
    const result = evaluator.evaluate(baseBrush, cutterBrush, SUBTRACTION)
    return {
      mesh: geometryToWelded(result.geometry),
      engraved: true,
      warning: "mesh non-manifold — engraved via csg fallback, hasil tidak dijamin watertight",
    }
  } catch (err) {
    return {
      mesh: base,
      engraved: false,
      warning: `engrave gagal (${err instanceof Error ? err.message : String(err)}) — part di-scale tanpa engrave`,
    }
  }
}
