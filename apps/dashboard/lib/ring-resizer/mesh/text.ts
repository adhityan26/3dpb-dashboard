import { readFileSync } from "node:fs"
import path from "node:path"
import * as opentype from "opentype.js"
import type { Manifold } from "manifold-3d"
import { getManifold } from "./manifold"

let fontCache: Buffer | null = null

export function loadEngraveFont(): Buffer {
  if (!fontCache) {
    fontCache = readFileSync(path.join(process.cwd(), "public/fonts/engrave.ttf"))
  }
  return fontCache
}

type Pt = [number, number]

/**
 * Flatten an opentype path into closed polygons (Y flipped: font space is
 * y-down, we want y-up). Bezier curves are sampled with `segments` steps.
 */
export function pathToPolygons(commands: opentype.PathCommand[], segments = 8): Pt[][] {
  const polys: Pt[][] = []
  let cur: Pt[] = []
  let last: Pt = [0, 0]

  const push = (x: number, y: number) => { last = [x, -y]; cur.push(last) }

  for (const c of commands) {
    if (c.type === "M") { if (cur.length > 2) polys.push(cur); cur = []; push(c.x, c.y) }
    else if (c.type === "L") push(c.x, c.y)
    else if (c.type === "Q") {
      const [x0, y0] = [last[0], -last[1]]
      for (let i = 1; i <= segments; i++) {
        const t = i / segments, mt = 1 - t
        push(mt * mt * x0 + 2 * mt * t * c.x1 + t * t * c.x,
             mt * mt * y0 + 2 * mt * t * c.y1 + t * t * c.y)
      }
    } else if (c.type === "C") {
      const [x0, y0] = [last[0], -last[1]]
      for (let i = 1; i <= segments; i++) {
        const t = i / segments, mt = 1 - t
        push(mt ** 3 * x0 + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t ** 3 * c.x,
             mt ** 3 * y0 + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t ** 3 * c.y)
      }
    } else if (c.type === "Z") { if (cur.length > 2) polys.push(cur); cur = [] }
  }
  if (cur.length > 2) polys.push(cur)
  return polys
}

/**
 * Build an extruded text solid. Capital-letter height ≈ heightMm (cap height
 * assumed ≈ 0.72 em). Solid is centered in X and Y, spans z ∈ [0, depthMm].
 */
export async function buildTextSolid(opts: {
  text: string
  fontBuf: Buffer
  heightMm: number
  depthMm: number
}): Promise<Manifold> {
  const { text, fontBuf, heightMm, depthMm } = opts
  // Buffer.buffer is typed as ArrayBuffer | SharedArrayBuffer in newer lib.dom
  // typings, but readFileSync (used by loadEngraveFont) never backs a Buffer
  // with a SharedArrayBuffer, so this narrowing is safe.
  const font = opentype.parse(
    fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength) as ArrayBuffer,
  )
  for (const ch of text) {
    if (ch !== " " && font.charToGlyphIndex(ch) === 0) {
      throw new Error(`character "${ch}" not available in engrave font`)
    }
  }
  const fontSize = heightMm / 0.72
  const otPath = font.getPath(text, 0, 0, fontSize)
  const polys = pathToPolygons(otPath.commands)
  if (polys.length === 0) throw new Error("text produced no outlines")

  const wasm = await getManifold()
  const cross = new wasm.CrossSection(polys, "EvenOdd")
  const solid = cross.extrude(depthMm)
  cross.delete()

  const bb = solid.boundingBox()
  const centered = solid.translate([
    -(bb.min[0] + bb.max[0]) / 2,
    -(bb.min[1] + bb.max[1]) / 2,
    0,
  ])
  solid.delete()
  return centered
}
