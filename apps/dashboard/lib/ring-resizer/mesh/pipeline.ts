import type { AnchorInput, PartResult } from "../types"
import { parseBinaryStl, exportBinaryStl, scaleMesh } from "./stl"
import { engraveWelded } from "./engrave"
import { detectCylinderFrame } from "./bore"
import { loadEngraveFont } from "./text"

/** Scale (exact, origin pivot) then engrave one part. */
export async function processPart(opts: {
  stl: Buffer
  scale: number
  anchors: AnchorInput[]
  text: string
}): Promise<PartResult> {
  const mesh = parseBinaryStl(opts.stl)
  scaleMesh(mesh, opts.scale)
  // Rotation frame (computed on the scaled mesh) lets the engraver bend text
  // around curved ring surfaces instead of stamping a flat tangent prism.
  const cylFrame = opts.anchors.length > 0 ? detectCylinderFrame(mesh) : null
  const r = await engraveWelded({
    base: mesh,
    anchors: opts.anchors,
    text: opts.text,
    fontBuf: loadEngraveFont(),
    scale: opts.scale,
    cylFrame,
  })
  return { stl: exportBinaryStl(r.mesh), engraved: r.engraved, warning: r.warning }
}

/** Filesystem/ZIP-safe label: anything outside [A-Za-z0-9._-] becomes "_". */
export function sanitizeLabel(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_")
}
