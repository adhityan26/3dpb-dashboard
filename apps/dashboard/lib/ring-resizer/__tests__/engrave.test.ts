import { describe, it, expect } from "vitest"
import { parseBinaryStl, makeCubeStl } from "../mesh/stl"
import { loadEngraveFont } from "../mesh/text"
import { anchorMatrix, engraveWelded, cylinderWarpFor } from "../mesh/engrave"
import { detectCylinderFrame, makeRingStl } from "../mesh/bore"
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
    // This fixture is deterministic: manifold-3d rejects the broken mesh
    // (rung 1 throws) and three-bvh-csg tolerates it (rung 2 succeeds). Pin
    // that exact outcome — asserting only `triVerts.length > 0` would also
    // pass via the give-up branch (mesh: base, engraved: false), so it
    // wouldn't catch a regression that breaks the csg fallback itself.
    expect(r.engraved).toBe(true)
    expect(r.warning).toBeTruthy()
    expect(r.warning).toContain("csg fallback")
    expect(r.mesh.triVerts.length).toBeGreaterThan(0)
  }, 30_000)

  it("degenerate anchor (up parallel to normal) degrades to give-up, doesn't throw", async () => {
    const base = parseBinaryStl(makeCubeStl(20))
    const degenerateAnchor: AnchorInput = {
      ...topAnchor,
      normal: [0, 0, 1],
      up: [0, 0, 1], // parallel to normal — cross(up, normal) is the zero vector
    }
    const r = await engraveWelded({
      base, anchors: [degenerateAnchor], text: "US 8", fontBuf: loadEngraveFont(), scale: 1,
    })
    // buildCutters (via anchorMatrix -> norm()) throws for this anchor; the
    // ladder must degrade to the scaled-only+warning branch instead of
    // rejecting the engraveWelded promise.
    expect(r.engraved).toBe(false)
    expect(r.warning).toBeTruthy()
    expect(r.mesh).toBe(base)
  })

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

describe("cylinderWarpFor", () => {
  // Ring around Z: axis [0,0,1], centre origin. Anchor on the INNER wall at
  // (10,0,6): surface normal points toward the axis, text up is axial.
  const frame = { axis: [0, 0, 1] as [number, number, number], center: [0, 0, 0] as [number, number, number] }
  const anchor: AnchorInput = {
    pos: [10, 0, 6], normal: [-1, 0, 0], up: [0, 0, 1], textHeightMm: 3, depthMm: 0.5,
  }

  it("maps the anchor point to itself and preserves radius/axial/arc-length", () => {
    const warp = cylinderWarpFor(frame, anchor, 1)
    expect(warp).not.toBeNull()
    const w = warp!

    // anchor itself is a fixed point
    expect(w([10, 0, 6])).toEqual([10, 0, 6].map((v) => expect.closeTo(v, 6)))

    // tangential offset s becomes arc length at the same radius
    const R = 10
    const s = (Math.PI / 2) * R // quarter turn
    // tangent at the anchor: t = axis × e_r = z × x = +y
    const p = w([10, s, 6])
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(R, 6) // still on the cylinder
    expect(p[2]).toBeCloseTo(6, 6)                   // axial preserved
    expect(p[0]).toBeCloseTo(0, 6)                   // rotated 90°
    expect(p[1]).toBeCloseTo(R, 6)

    // radial offset is preserved: a point 0.5mm INTO the material (away from
    // the axis, -normal direction = +x here) stays 0.5mm beyond the surface
    const q = w([10.5, s, 6])
    expect(Math.hypot(q[0], q[1])).toBeCloseTo(R + 0.5, 6)
  })

  it("declines to wrap when the anchor normal is axial (flat top face)", () => {
    const topAnchorOnRing: AnchorInput = {
      pos: [10, 0, 12], normal: [0, 0, 1], up: [0, 1, 0], textHeightMm: 3, depthMm: 0.5,
    }
    expect(cylinderWarpFor(frame, topAnchorOnRing, 1)).toBeNull()
  })
})

describe("engraveWelded with cylindrical wrap", () => {
  it("engraves text bent around a ring inner wall", async () => {
    const base = parseBinaryStl(makeRingStl({ innerDiaMm: 20, outerDiaMm: 26, heightMm: 12 }))
    const frame = detectCylinderFrame(base)
    expect(frame).not.toBeNull()
    const before = meshVolume(base)
    const r = await engraveWelded({
      base,
      anchors: [{ pos: [10, 0, 6], normal: [-1, 0, 0], up: [0, 0, 1], textHeightMm: 4, depthMm: 0.5 }],
      text: "8888",
      fontBuf: loadEngraveFont(),
      scale: 1,
      cylFrame: frame,
    })
    expect(r.engraved).toBe(true)
    const after = meshVolume(r.mesh)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(before * 0.9)
  }, 30_000)
})
