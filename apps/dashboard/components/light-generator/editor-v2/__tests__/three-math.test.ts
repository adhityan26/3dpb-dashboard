import { describe, expect, it } from "vitest"
import { casingOuterRadius, stemAnchorEdge, stemGizmoTransforms, zLightMm } from "../three-math"

describe("casingOuterRadius", () => {
  it("reads outer_radius, defaults to 100", () => {
    expect(casingOuterRadius({ outer_radius: 150 })).toBe(150)
    expect(casingOuterRadius({})).toBe(100)
  })
})

describe("stemAnchorEdge", () => {
  it("anchors to top when cover_type is 'top'", () => {
    expect(stemAnchorEdge({ cover_type: "top" })).toBe("top")
  })
  it("anchors to bottom for any other cover_type (including missing)", () => {
    expect(stemAnchorEdge({ cover_type: "bottom" })).toBe("bottom")
    expect(stemAnchorEdge({})).toBe("bottom")
    expect(stemAnchorEdge({ cover_type: "recess" })).toBe("bottom")
  })
})

describe("zLightMm", () => {
  it("adds light_z_offset on top of wallZRange's zMaxMm", () => {
    // casing_lift=0, base_thickness default 2, shell_height explicit 80,
    // light_z_offset explicit 15 -> zMaxMm = 0+80 = 80, zLight = 80+15 = 95
    const config = { casing_lift: 0, shell_height: 80, light_z_offset: 15 }
    expect(zLightMm(config)).toBe(95)
  })

  it("defaults light_z_offset to 10 when unset", () => {
    const config = { casing_lift: 0, shell_height: 50 }
    expect(zLightMm(config)).toBe(60)
  })

  it("uses the auto shell_height rule when shell_height is null/undefined", () => {
    // shell_height auto = light_z_offset * (floor_half/outer_radius - 1)
    const config = {
      casing_lift: 10,
      outer_radius: 100,
      floor_half_size: 600,
      light_z_offset: 10,
    }
    const autoShell = 10 * (600 / 100 - 1) // 50
    expect(zLightMm(config)).toBe(10 + autoShell + 10)
  })
})

describe("stemGizmoTransforms", () => {
  it("returns [] when user_stems is missing or not an array", () => {
    expect(stemGizmoTransforms({})).toEqual([])
    expect(stemGizmoTransforms({ user_stems: "nope" })).toEqual([])
  })

  it("skips malformed entries", () => {
    const config = {
      user_stems: [
        { id: "a" }, // missing theta/z
        { id: "b", theta_deg: "10", z_mm: 5 }, // wrong types
        null,
        { id: "c", theta_deg: 0, z_mm: 10 },
      ],
    }
    const out = stemGizmoTransforms(config)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("c")
  })

  it("maps theta=0 to +x axis at the outer radius", () => {
    const config = { outer_radius: 100, user_stems: [{ id: "s1", theta_deg: 0, z_mm: 30 }] }
    const [t] = stemGizmoTransforms(config)
    expect(t.x).toBeCloseTo(100)
    expect(t.y).toBeCloseTo(0)
  })

  it("maps theta=90 to +y axis", () => {
    const config = { outer_radius: 50, user_stems: [{ id: "s1", theta_deg: 90, z_mm: 30 }] }
    const [t] = stemGizmoTransforms(config)
    expect(t.x).toBeCloseTo(0, 5)
    expect(t.y).toBeCloseTo(50)
  })

  it("bottom-anchored stem spans from wall base (zMinMm) up to z_mm", () => {
    // casing_lift=0, base_thickness default 2 -> zMinMm = 2
    const config = {
      cover_type: "bottom",
      casing_lift: 0,
      user_stems: [{ id: "s1", theta_deg: 0, z_mm: 30 }],
    }
    const [t] = stemGizmoTransforms(config)
    // spans [2, 30] -> center 16, height 28
    expect(t.height).toBeCloseTo(28)
    expect(t.z).toBeCloseTo(16)
  })

  it("top-anchored stem spans from z_mm up to wall top (zMaxMm)", () => {
    const config = {
      cover_type: "top",
      casing_lift: 0,
      shell_height: 80,
      user_stems: [{ id: "s1", theta_deg: 0, z_mm: 30 }],
    }
    const [t] = stemGizmoTransforms(config)
    // zMaxMm = 80, spans [30, 80] -> center 55, height 50
    expect(t.height).toBeCloseTo(50)
    expect(t.z).toBeCloseTo(55)
  })
})
