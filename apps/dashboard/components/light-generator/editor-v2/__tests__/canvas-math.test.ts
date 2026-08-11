import { describe, it, expect } from "vitest"
import {
  pxToMm,
  applyOffsetDrag,
  applyFloorResizeDrag,
  applyPaddingDrag,
  paddingPctToRadiusFraction,
} from "../canvas-math"

describe("pxToMm", () => {
  it("maps px to mm linearly using image width = 2*floorHalf mm", () => {
    // imgPx=400 spans 2*600=1200mm => 3mm/px
    const { dxMm, dyMm } = pxToMm(10, 0, 400, 600)
    expect(dxMm).toBeCloseTo(30)
    expect(dyMm).toBeCloseTo(0)
  })

  it("inverts screen y: dragging down (positive dyPx) yields negative mm y", () => {
    const { dyMm } = pxToMm(0, 10, 400, 600)
    expect(dyMm).toBeCloseTo(-30)
  })

  it("dragging up (negative dyPx) yields positive mm y", () => {
    const { dyMm } = pxToMm(0, -10, 400, 600)
    expect(dyMm).toBeCloseTo(30)
  })

  it("returns zero when imgPx is non-positive (guards against div-by-zero)", () => {
    expect(pxToMm(10, 10, 0, 600)).toEqual({ dxMm: 0, dyMm: 0 })
  })
})

describe("applyOffsetDrag", () => {
  it("drag right increases shadow_offset_x", () => {
    const next = applyOffsetDrag({ floor_half_size: 600, shadow_offset_x: 0, shadow_offset_y: 0 }, 10, 0, 400)
    expect(next.shadow_offset_x).toBeCloseTo(30)
    expect(next.shadow_offset_y).toBeCloseTo(0)
  })

  it("drag down decreases shadow_offset_y (screen-down = -y mm)", () => {
    const next = applyOffsetDrag({ floor_half_size: 600, shadow_offset_x: 0, shadow_offset_y: 0 }, 0, 10, 400)
    expect(next.shadow_offset_y).toBeCloseTo(-30)
  })

  it("drag up increases shadow_offset_y", () => {
    const next = applyOffsetDrag({ floor_half_size: 600, shadow_offset_x: 0, shadow_offset_y: 0 }, 0, -10, 400)
    expect(next.shadow_offset_y).toBeCloseTo(30)
  })

  it("accumulates on top of existing offsets and rounds to 1 decimal", () => {
    const next = applyOffsetDrag({ floor_half_size: 600, shadow_offset_x: 5, shadow_offset_y: -2 }, 1, 0, 400)
    // mmPerPx = 3, dx=3 -> 5+3=8
    expect(next.shadow_offset_x).toBe(8)
  })

  it("defaults floor_half_size to 600 when missing", () => {
    const next = applyOffsetDrag({}, 10, 0, 400)
    expect(next.shadow_offset_x).toBeCloseTo(30)
  })
})

describe("applyFloorResizeDrag", () => {
  it("dragging handle inward (r < imgHalf) grows floor_half_size", () => {
    // floorHalf=600, imgHalf=200, r=100 -> newFloorHalf = 600 * 200/100 = 1200
    const next = applyFloorResizeDrag({ floor_half_size: 600 }, 100, 400)
    expect(next.floor_half_size).toBe(1200)
  })

  it("dragging handle outward (r > imgHalf) shrinks floor_half_size", () => {
    // floorHalf=600, imgHalf=200, r=400 -> newFloorHalf = 600 * 200/400 = 300
    const next = applyFloorResizeDrag({ floor_half_size: 600 }, 400, 400)
    expect(next.floor_half_size).toBe(300)
  })

  it("handle at rest position (r = imgHalf) keeps floor_half_size unchanged", () => {
    const next = applyFloorResizeDrag({ floor_half_size: 600 }, 200, 400)
    expect(next.floor_half_size).toBe(600)
  })

  it("clamps to [50, 2000] and rounds to whole mm", () => {
    const shrunk = applyFloorResizeDrag({ floor_half_size: 600 }, 10000, 400)
    expect(shrunk.floor_half_size).toBe(50)
    const grown = applyFloorResizeDrag({ floor_half_size: 600 }, 1, 400)
    expect(grown.floor_half_size).toBe(2000)
  })

  it("no-ops (returns config copy) when radius or imgPx is non-positive", () => {
    const next = applyFloorResizeDrag({ floor_half_size: 600 }, 0, 400)
    expect(next.floor_half_size).toBe(600)
  })
})

describe("paddingPctToRadiusFraction / applyPaddingDrag roundtrip", () => {
  it.each([0, 10, 50, 100])("pct=%d roundtrips through fraction back to the same pct", (pct) => {
    const f = paddingPctToRadiusFraction(pct)
    const imgPx = 400
    const imgHalf = imgPx / 2
    const handleRadiusPx = f * imgHalf
    const roundtripped = applyPaddingDrag({}, handleRadiusPx, imgPx)
    expect(roundtripped.mask_padding_pct).toBe(pct)
  })

  it("sets auto_fit_mask=false on manual drag", () => {
    const next = applyPaddingDrag({ auto_fit_mask: true }, 150, 400)
    expect(next.auto_fit_mask).toBe(false)
  })

  it("clamps pct into [0, 100]", () => {
    const wayOut = applyPaddingDrag({}, 10000, 400) // f > 1 -> pct negative -> clamp 0
    expect(wayOut.mask_padding_pct).toBeGreaterThanOrEqual(0)
    const tiny = applyPaddingDrag({}, 0.001, 400) // f ~ 0 -> pct clamp 100
    expect(tiny.mask_padding_pct).toBeLessThanOrEqual(100)
  })
})
