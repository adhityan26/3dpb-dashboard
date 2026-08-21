import { describe, it, expect } from "vitest"
import {
  wallPxToThetaZ,
  thetaZToWallPx,
  stemAngularWidthDeg,
  upsertStem,
  removeStem,
  wallZRange,
  anchorAllIslands,
  type UserStem,
} from "../wall-math"

describe("wallPxToThetaZ / thetaZToWallPx roundtrip", () => {
  it("maps top-left to (theta=0, z=zMax)", () => {
    const { thetaDeg, zMm } = wallPxToThetaZ(0, 0, 1024, 256, 10, 50)
    expect(thetaDeg).toBe(0)
    expect(zMm).toBe(50)
  })

  it("maps bottom to z=zMin", () => {
    const { zMm } = wallPxToThetaZ(0, 256, 1024, 256, 10, 50)
    expect(zMm).toBe(10)
  })

  it("maps mid-width to theta=180", () => {
    const { thetaDeg } = wallPxToThetaZ(512, 0, 1024, 256, 10, 50)
    expect(thetaDeg).toBe(180)
  })

  it("roundtrips px -> theta/z -> px within half a snap step", () => {
    const wPx = 1024
    const hPx = 256
    const zMin = 12
    const zMax = 48
    for (const [xPx, yPx] of [[10, 10], [500, 120], [1000, 250], [256, 64]]) {
      const { thetaDeg, zMm } = wallPxToThetaZ(xPx, yPx, wPx, hPx, zMin, zMax)
      const back = thetaZToWallPx(thetaDeg, zMm, wPx, hPx, zMin, zMax)
      // Snapping (0.1deg / 0.5mm) means the roundtrip isn't pixel-exact —
      // allow a small tolerance proportional to one snap step in px.
      expect(Math.abs(back.xPx - xPx)).toBeLessThan(wPx / 360 + 1)
      expect(Math.abs(back.yPx - yPx)).toBeLessThan((hPx / (zMax - zMin)) * 0.5 + 1)
    }
  })

  it("thetaZToWallPx wraps theta at 360", () => {
    const { xPx } = thetaZToWallPx(360, 30, 1024, 256, 10, 50)
    expect(xPx).toBe(0)
  })

  it("snaps theta to 1 decimal and z to 0.5mm steps", () => {
    const { thetaDeg, zMm } = wallPxToThetaZ(333, 77, 1000, 200, 0, 20)
    expect(Number.isInteger(thetaDeg * 10)).toBe(true)
    expect(Number.isInteger(zMm * 2)).toBe(true)
  })
})

describe("stemAngularWidthDeg", () => {
  it("computes proportional angular width", () => {
    expect(stemAngularWidthDeg(2, 512)).toBeCloseTo((2 / 512) * 360, 6)
  })

  it("returns 0 when nStencilTheta is 0", () => {
    expect(stemAngularWidthDeg(2, 0)).toBe(0)
  })
})

describe("upsertStem / removeStem", () => {
  const base = { foo: "bar", user_stems: [{ id: "a", theta_deg: 10, z_mm: 5 }] }

  it("adds a new stem without mutating the original config", () => {
    const stem: UserStem = { id: "b", theta_deg: 20, z_mm: 15 }
    const next = upsertStem(base, stem)
    expect(next).not.toBe(base)
    expect(next.user_stems).toEqual([
      { id: "a", theta_deg: 10, z_mm: 5 },
      { id: "b", theta_deg: 20, z_mm: 15 },
    ])
    // original untouched
    expect(base.user_stems).toEqual([{ id: "a", theta_deg: 10, z_mm: 5 }])
  })

  it("updates an existing stem in place by id", () => {
    const stem: UserStem = { id: "a", theta_deg: 99, z_mm: 1 }
    const next = upsertStem(base, stem)
    expect(next.user_stems).toEqual([{ id: "a", theta_deg: 99, z_mm: 1 }])
  })

  it("initializes user_stems when absent", () => {
    const next = upsertStem({ foo: "bar" }, { id: "x", theta_deg: 1, z_mm: 2 })
    expect(next.user_stems).toEqual([{ id: "x", theta_deg: 1, z_mm: 2 }])
  })

  it("removes a stem by id immutably", () => {
    const next = removeStem(base, "a")
    expect(next).not.toBe(base)
    expect(next.user_stems).toEqual([])
    expect(base.user_stems).toEqual([{ id: "a", theta_deg: 10, z_mm: 5 }])
  })

  it("removeStem is a no-op for an unknown id", () => {
    const next = removeStem(base, "nope")
    expect(next.user_stems).toEqual(base.user_stems)
  })
})

describe("wallZRange", () => {
  it("uses defaults matching preview_renderer.py's _PREVIEW_DEFAULTS", () => {
    // casing_lift=0, base_thickness=2 -> zMin=2
    // shell_height auto = light_z_offset(10) * (floor_half(600)/outer_radius(100) - 1) = 50
    // zMax = casing_lift(0) + 50 = 50
    const { zMinMm, zMaxMm } = wallZRange({})
    expect(zMinMm).toBe(2)
    expect(zMaxMm).toBe(50)
  })

  it("respects an explicit shell_height override", () => {
    const { zMaxMm } = wallZRange({ casing_lift: 5, shell_height: 40 })
    expect(zMaxMm).toBe(45)
  })

  it("respects casing_lift and base_thickness overrides", () => {
    const { zMinMm } = wallZRange({ casing_lift: 3, base_thickness: 4 })
    expect(zMinMm).toBe(7)
  })
})

describe("anchorAllIslands", () => {
  it("adds one stem per island when far apart", () => {
    const config = { stem_width: 2, n_stencil_theta: 360 }
    const islands = [
      { theta_deg: 10, z_mm: 20 },
      { theta_deg: 100, z_mm: 25 },
    ]
    const next = anchorAllIslands(config, islands)
    const stems = next.user_stems as UserStem[]
    expect(stems).toHaveLength(2)
    expect(stems[0]).toMatchObject({ theta_deg: 10, z_mm: 20 })
    expect(stems[1]).toMatchObject({ theta_deg: 100, z_mm: 25 })
  })

  it("skips islands within stemAngularWidthDeg of an existing user stem", () => {
    // angular width = 2/360*360 = 2deg
    const config = {
      stem_width: 2,
      n_stencil_theta: 360,
      user_stems: [{ id: "manual-1", theta_deg: 10, z_mm: 5 }],
    }
    const islands = [{ theta_deg: 11, z_mm: 20 }] // within 2deg of the manual stem
    const next = anchorAllIslands(config, islands)
    expect(next.user_stems).toHaveLength(1)
  })

  it("dedupes nearby islands against each other within the same call", () => {
    const config = { stem_width: 2, n_stencil_theta: 360 }
    const islands = [
      { theta_deg: 10, z_mm: 20 },
      { theta_deg: 10.5, z_mm: 20 }, // within 2deg of the first
    ]
    const next = anchorAllIslands(config, islands)
    expect(next.user_stems).toHaveLength(1)
  })

  it("handles wraparound near 0/360", () => {
    const config = {
      stem_width: 2,
      n_stencil_theta: 360,
      user_stems: [{ id: "manual-1", theta_deg: 359, z_mm: 5 }],
    }
    const islands = [{ theta_deg: 0.5, z_mm: 20 }] // 1.5deg away across the wrap
    const next = anchorAllIslands(config, islands)
    expect(next.user_stems).toHaveLength(1)
  })

  it("does not mutate the original config", () => {
    const config = { stem_width: 2, n_stencil_theta: 360, user_stems: [] as UserStem[] }
    anchorAllIslands(config, [{ theta_deg: 10, z_mm: 20 }])
    expect(config.user_stems).toEqual([])
  })
})
