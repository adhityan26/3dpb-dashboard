import { describe, it, expect } from "vitest"
import { parseBinaryStl, makeCubeStl, scaleMesh } from "../mesh/stl"
import { loadEngraveFont } from "../mesh/text"
import { anchorMatrix, engraveWelded } from "../mesh/engrave"
import { getManifold } from "../mesh/manifold"
import type { AnchorInput } from "../types"

const topAnchor: AnchorInput = {
  pos: [10, 10, 20],            // center of the top face of a 20mm cube
  normal: [0, 0, 1],
  up: [0, 1, 0],
  textHeightMm: 4,
  depthMm: 0.5,
}

function meshVolume(mesh: { vertProperties: Float32Array; triVerts: Uint32Array }): number {
  // signed tetrahedron sum — enough for watertight test meshes
  let v = 0
  const p = mesh.vertProperties, t = mesh.triVerts
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3]
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6
  }
  return Math.abs(v)
}

describe("anchorMatrix", () => {
  it("maps local +Z to the anchor normal and origin to scaled pos", () => {
    const m = anchorMatrix(topAnchor, 0.5)
    // column-major: translation = m[12..14] = pos * scale
    expect(m[12]).toBeCloseTo(5); expect(m[13]).toBeCloseTo(5); expect(m[14]).toBeCloseTo(10)
    // Z column = normal
    expect(m[8]).toBeCloseTo(0); expect(m[9]).toBeCloseTo(0); expect(m[10]).toBeCloseTo(1)
  })
})

describe("engraveWelded", () => {
  it("cuts material from a manifold cube (volume decreases)", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    const before = meshVolume(base)
    const r = await engraveWelded({
      base, anchors: [topAnchor], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    expect(r.engraved).toBe(true)
    expect(r.warning).toBeUndefined()
    const after = meshVolume(r.mesh)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(before * 0.9) // shallow engraving, not destruction
  })

  it("falls back for a non-manifold base and still returns a result", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    // break manifoldness: drop one triangle
    const broken = { vertProperties: base.vertProperties, triVerts: base.triVerts.slice(3) }
    const r = await engraveWelded({
      base: broken, anchors: [topAnchor], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    // either the csg fallback engraved it, or it fell through to scaled-only+warning
    expect(r.mesh.triVerts.length).toBeGreaterThan(0)
    if (!r.engraved) expect(r.warning).toBeTruthy()
  }, 30_000)

  it("no anchors → returns base untouched, engraved=false, no warning", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    const r = await engraveWelded({
      base, anchors: [], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    expect(r.engraved).toBe(false)
    expect(r.warning).toBeUndefined()
    expect(r.mesh).toBe(base)
  })

  it("sanity: manifold module loads", async () => {
    const wasm = await getManifold()
    expect(wasm.Manifold).toBeDefined()
  })
})
