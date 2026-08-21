import { describe, it, expect } from "vitest"
import {
  pxToMm,
  applyOffsetDrag,
  applyImageResize,
  applyCasingResize,
  applyCasingDrag,
  applyLampDrag,
  casingScreenRadius,
  paddingPctToRadiusFraction,
  radiusFractionToPaddingPct,
  overlayGeometry,
  buildImageFilter,
  parseFlooringShape,
  resizeFromCursor,
  adjustDeltaForZoom,
  clampZoom,
} from "../canvas-math"

describe("adjustDeltaForZoom", () => {
  it("passes deltas through unchanged at zoom 1", () => {
    expect(adjustDeltaForZoom(20, -10, 1)).toEqual({ dx: 20, dy: -10 })
  })
  it("divides real screen-px deltas by the zoom factor to recover logical px", () => {
    expect(adjustDeltaForZoom(20, -10, 2)).toEqual({ dx: 10, dy: -5 })
  })
  it("falls back to zoom 1 for a zero/invalid zoom to avoid dividing by zero", () => {
    expect(adjustDeltaForZoom(20, -10, 0)).toEqual({ dx: 20, dy: -10 })
  })
})

describe("clampZoom", () => {
  it("clamps below the minimum", () => {
    expect(clampZoom(0.1)).toBe(0.5)
  })
  it("clamps above the maximum", () => {
    expect(clampZoom(10)).toBe(3)
  })
  it("passes through in-range values", () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })
})

describe("buildImageFilter", () => {
  it("defaults (0/0/100) produce a no-op filter string", () => {
    expect(buildImageFilter({})).toBe("brightness(1) contrast(1) saturate(100%)")
  })

  it("explicit defaults produce the same no-op string", () => {
    expect(buildImageFilter({ img_brightness: 0, img_contrast: 0, img_saturation: 100 })).toBe(
      "brightness(1) contrast(1) saturate(100%)",
    )
  })

  it("builds a custom filter string from config values", () => {
    expect(
      buildImageFilter({ img_brightness: 20, img_contrast: -10, img_saturation: 50 }),
    ).toBe("brightness(1.2) contrast(0.9) saturate(50%)")
  })

  it("treats missing saturation as 100 while honoring other values", () => {
    expect(buildImageFilter({ img_brightness: -50 })).toBe(
      "brightness(0.5) contrast(1) saturate(100%)",
    )
  })
})

describe("overlayGeometry", () => {
  it("square container: size = side length, no offset", () => {
    expect(overlayGeometry(500, 500)).toEqual({ size: 500, offsetX: 0, offsetY: 0 })
  })

  it("wide container: size = height, centered horizontally", () => {
    expect(overlayGeometry(800, 500)).toEqual({ size: 500, offsetX: 150, offsetY: 0 })
  })

  it("tall container: size = width, centered vertically", () => {
    expect(overlayGeometry(500, 900)).toEqual({ size: 500, offsetX: 0, offsetY: 200 })
  })

  it("zero-size container clamps to zero instead of negative", () => {
    expect(overlayGeometry(0, 0)).toEqual({ size: 0, offsetX: 0, offsetY: 0 })
  })
})

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

describe("applyOffsetDrag (Object 1 — main image body drag)", () => {
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

describe("applyCasingDrag (Object 2 — casing body drag is the INVERSE of image drag)", () => {
  it("drag right DECREASES shadow_offset_x (opposite of applyOffsetDrag)", () => {
    const next = applyCasingDrag({ floor_half_size: 600, shadow_offset_x: 0, shadow_offset_y: 0 }, 10, 0, 400)
    expect(next.shadow_offset_x).toBeCloseTo(-30)
  })

  it("drag down INCREASES shadow_offset_y (opposite of applyOffsetDrag)", () => {
    const next = applyCasingDrag({ floor_half_size: 600, shadow_offset_x: 0, shadow_offset_y: 0 }, 0, 10, 400)
    expect(next.shadow_offset_y).toBeCloseTo(30)
  })

  it("accumulates on top of existing offsets", () => {
    const next = applyCasingDrag({ floor_half_size: 600, shadow_offset_x: 5, shadow_offset_y: -2 }, 1, 0, 400)
    expect(next.shadow_offset_x).toBe(2) // 5 - 3
  })
})

describe("paddingPctToRadiusFraction / applyImageResize roundtrip", () => {
  it.each([0, 10, 50, 100])("pct=%d roundtrips through fraction back to the same pct", (pct) => {
    const f = paddingPctToRadiusFraction(pct)
    const roundtripped = applyImageResize({}, f)
    expect(roundtripped.mask_padding_pct).toBe(pct)
  })

  it("sets auto_fit_mask=false on manual resize", () => {
    const next = applyImageResize({ auto_fit_mask: true }, 0.5)
    expect(next.auto_fit_mask).toBe(false)
  })

  it("clamps pct into [0, 100]", () => {
    const shrunkFraction = applyImageResize({}, 1000) // f huge -> pct negative -> clamp 0
    expect(shrunkFraction.mask_padding_pct).toBeGreaterThanOrEqual(0)
    const grownFraction = applyImageResize({}, 0.0001) // f ~ 0 -> pct clamp 100
    expect(grownFraction.mask_padding_pct).toBeLessThanOrEqual(100)
  })
})

describe("radiusFractionToPaddingPct", () => {
  it("f=1 (no padding) -> pct 0", () => {
    expect(radiusFractionToPaddingPct(1)).toBe(0)
  })

  it("f<=0 -> pct 100 (guards div-by-zero)", () => {
    expect(radiusFractionToPaddingPct(0)).toBe(100)
  })
})

describe("casingScreenRadius / applyCasingResize roundtrip", () => {
  it("computes the rest on-screen radius for outer_radius/floor_half/imgPx", () => {
    // outer_radius=100, floor_half=600, imgPx=400 (imgHalf=200) -> 100*200/600 = 33.33
    expect(casingScreenRadius(100, 600, 400)).toBeCloseTo(33.33, 1)
  })

  it("returns 0 when floorHalf is non-positive", () => {
    expect(casingScreenRadius(100, 0, 400)).toBe(0)
  })

  it("resizing the casing to its own rest radius leaves floor_half_size unchanged", () => {
    const r = casingScreenRadius(100, 600, 400)
    const next = applyCasingResize({ outer_radius: 100, floor_half_size: 600 }, r, 400)
    expect(next.floor_half_size).toBe(600)
  })

  it("a BIGGER casing on screen (larger R) implies a SMALLER floor_half_size", () => {
    const next = applyCasingResize({ outer_radius: 100, floor_half_size: 600 }, 200, 400)
    // 100 * 200/200 = 100
    expect(next.floor_half_size).toBe(100)
  })

  it("a SMALLER casing on screen (smaller R) implies a BIGGER floor_half_size", () => {
    const next = applyCasingResize({ outer_radius: 100, floor_half_size: 600 }, 10, 400)
    // 100 * 200/10 = 2000 -> clamped
    expect(next.floor_half_size).toBe(2000)
  })

  it("clamps to [50, 2000]", () => {
    const shrunk = applyCasingResize({ outer_radius: 100 }, 100000, 400)
    expect(shrunk.floor_half_size).toBe(50)
    const grown = applyCasingResize({ outer_radius: 100 }, 0.01, 400)
    expect(grown.floor_half_size).toBe(2000)
  })

  it("no-ops (returns config copy) when radius or imgPx is non-positive", () => {
    const next = applyCasingResize({ outer_radius: 100, floor_half_size: 600 }, 0, 400)
    expect(next.floor_half_size).toBe(600)
  })
})

describe("applyLampDrag (Object 3 — lamp position relative to casing center)", () => {
  it("converts absolute px offset from casing center to mm", () => {
    // imgPx=400, floorHalf=600 -> 3mm/px; xPx=5 -> 15mm
    const next = applyLampDrag({ floor_half_size: 600 }, 5, 0, 400)
    expect(next.light_x).toBe(15)
    expect(next.light_y).toBe(-0)
  })

  it("inverts screen y for light_y", () => {
    const next = applyLampDrag({ floor_half_size: 600 }, 0, 5, 400)
    expect(next.light_y).toBe(-15)
  })

  it("clamps to +-50mm", () => {
    const next = applyLampDrag({ floor_half_size: 600 }, 1000, 1000, 400)
    expect(next.light_x).toBe(50)
    expect(next.light_y).toBe(-50)
    const neg = applyLampDrag({ floor_half_size: 600 }, -1000, -1000, 400)
    expect(neg.light_x).toBe(-50)
    expect(neg.light_y).toBe(50)
  })

  it("is absolute, not accumulated — re-dragging to the same spot yields the same value", () => {
    const a = applyLampDrag({ floor_half_size: 600, light_x: 40, light_y: 40 }, 5, 0, 400)
    expect(a.light_x).toBe(15)
  })
})

describe("parseFlooringShape", () => {
  it("defaults to circle when raw is missing/empty", () => {
    expect(parseFlooringShape(undefined)).toEqual({ base: "circle", w: 1, h: 1 })
    expect(parseFlooringShape("")).toEqual({ base: "circle", w: 1, h: 1 })
  })

  it("parses simple shape strings", () => {
    expect(parseFlooringShape("square")).toEqual({ base: "square", w: 1, h: 1 })
    expect(parseFlooringShape("triangle")).toEqual({ base: "triangle", w: 1, h: 1 })
    expect(parseFlooringShape("custom")).toEqual({ base: "custom", w: 1, h: 1 })
  })

  it("parses rect:W:H and oval:W:H with numeric ratios", () => {
    expect(parseFlooringShape("rect:3:4")).toEqual({ base: "rect", w: 3, h: 4 })
    expect(parseFlooringShape("oval:16:9")).toEqual({ base: "oval", w: 16, h: 9 })
  })

  it("falls back to sane default ratios for bare rect/oval", () => {
    expect(parseFlooringShape("rect")).toEqual({ base: "rect", w: 3, h: 4 })
    expect(parseFlooringShape("oval")).toEqual({ base: "oval", w: 16, h: 9 })
  })
})

describe("resizeFromCursor (Object 1/2 relative corner-handle resize)", () => {
  it("is identity when the cursor hasn't moved from its start (r === r0)", () => {
    expect(resizeFromCursor(100, 50, 50)).toBe(100)
  })

  it("doubles the size when the cursor's distance to center doubles (r === 2*r0)", () => {
    expect(resizeFromCursor(100, 50, 100)).toBe(200)
  })

  it("halves the size when the cursor moves to half its start distance", () => {
    expect(resizeFromCursor(100, 50, 25)).toBe(50)
  })

  it("guards against a tiny r0 (press near dead center) by returning S0 unchanged", () => {
    expect(resizeFromCursor(100, 0, 999)).toBe(100)
    expect(resizeFromCursor(100, 3, 999)).toBe(100)
  })
})
