// Pure geometry helpers for the LG editor v2 Canvas Editor's OBJECT-based
// direct-manipulation overlay (image backdrop, casing shape, lamp). No
// DOM/React here — keeps these trivially unit-testable and usable both for
// live drag math and for computing static handle/overlay positions.
//
// Coordinate conventions:
// - The wrapper is always square, `imgPx` (= S) wide/tall on screen and
//   represents the floor spanning [-floorHalf, +floorHalf] mm, i.e.
//   1 px = (2*floorHalf/imgPx) mm. Screen y grows downward; mm y (per the
//   generator's PY = cy - FY convention) grows upward, so a positive
//   screen-space dy (drag down) maps to a NEGATIVE mm dy.
// - The casing is ALWAYS the origin of generator space — it sits at the
//   wrapper center at rest. The image backdrop is drawn translated by
//   (shadow_offset_x, shadow_offset_y) relative to that same center.

/** Convert a screen-pixel delta to a floor-mm delta (screen down = -y mm). */
export function pxToMm(
  dxPx: number,
  dyPx: number,
  imgPx: number,
  floorHalf: number,
): { dxMm: number; dyMm: number } {
  if (imgPx <= 0) return { dxMm: 0, dyMm: 0 }
  const mmPerPx = (2 * floorHalf) / imgPx
  return {
    dxMm: dxPx * mmPerPx,
    dyMm: -dyPx * mmPerPx, // screen-down (positive dyPx) => decrease mm y
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Object 1 (Main image) body drag ("grab the backdrop, move it") updates
 * shadow_offset_x/y. Sign: dragging right (+dxPx) increases offset_x;
 * dragging DOWN (+dyPx) DECREASES offset_y (screen down = -y mm, per
 * pxToMm above), matching the preview's PY = cy - FY convention where a
 * larger offset_y pushes the shadow further from the camera row = visually
 * UP.
 */
export function applyOffsetDrag(
  config: Record<string, unknown>,
  dxPx: number,
  dyPx: number,
  imgPx: number,
): Record<string, unknown> {
  const floorHalf = Number(config.floor_half_size) || 600
  const { dxMm, dyMm } = pxToMm(dxPx, dyPx, imgPx, floorHalf)
  const curX = Number(config.shadow_offset_x) || 0
  const curY = Number(config.shadow_offset_y) || 0
  return {
    ...config,
    shadow_offset_x: round1(curX + dxMm),
    shadow_offset_y: round1(curY + dyMm),
  }
}

const FLOOR_MIN = 50
const FLOOR_MAX = 2000

/**
 * Padding pct <-> content-fraction mapping. Padding pct adds pct% of
 * max(h,w) to EACH side, so the content circle/box's fraction of the full
 * image is f = 1 / (1 + 2*pct/100). Inverting: pct = 50 * (1 - f) / f.
 */
export function paddingPctToRadiusFraction(pct: number): number {
  const p = clamp(pct, 0, 100)
  return 1 / (1 + (2 * p) / 100)
}

export function radiusFractionToPaddingPct(f: number): number {
  if (f <= 0) return 100
  const pct = (50 * (1 - f)) / f
  return Math.round(clamp(pct, 0, 100))
}

/**
 * Object 1 (Main image) corner-handle resize. `newFraction` is the desired
 * content fraction (displayed image size / full wrapper size), computed by
 * the caller from the dragged corner's distance to center. Inverted into
 * mask_padding_pct via radiusFractionToPaddingPct and flips auto_fit_mask
 * off, since a manual resize is an explicit override of auto-fit.
 */
export function applyImageResize(
  config: Record<string, unknown>,
  newFraction: number,
): Record<string, unknown> {
  const pct = radiusFractionToPaddingPct(newFraction)
  return {
    ...config,
    mask_padding_pct: pct,
    auto_fit_mask: false,
  }
}

/**
 * Object 2 (Casing) corner-handle resize. The casing's on-screen radius
 * `casingRadiusPx` represents outer_radius mm; the rest position (radius =
 * casingScreenRadius(outer_radius, floor_half_size, imgPx)) already
 * represents the CURRENT floor_half_size. Dragging the handle to a new
 * radius R means "outer_radius mm now spans R px", i.e. a BIGGER casing on
 * screen implies a SMALLER floor represented by the same wrapper:
 *
 *   newFloorHalf = outer_radius * (imgHalf / R)
 *
 * (same inverse relationship as the old floor-ring math, just parameterized
 * by outer_radius instead of the previous floor-half rest radius.)
 */
export function applyCasingResize(
  config: Record<string, unknown>,
  casingRadiusPx: number,
  imgPx: number,
): Record<string, unknown> {
  const outerRadius = Number(config.outer_radius) || 100
  const imgHalf = imgPx / 2
  if (casingRadiusPx <= 0 || imgHalf <= 0) return { ...config }
  const raw = outerRadius * (imgHalf / casingRadiusPx)
  const clamped = clamp(raw, FLOOR_MIN, FLOOR_MAX)
  return {
    ...config,
    floor_half_size: Math.round(clamped),
  }
}

/** Inverse of applyCasingResize's relationship — the casing's rest on-screen
 * radius (px) for a given outer_radius/floor_half_size/imgPx, used to draw
 * the casing overlay and its bounding-box handles. */
export function casingScreenRadius(
  outerRadius: number,
  floorHalf: number,
  imgPx: number,
): number {
  const imgHalf = imgPx / 2
  if (floorHalf <= 0) return 0
  return outerRadius * (imgHalf / floorHalf)
}

/**
 * Object 2 (Casing) body drag. The casing is always the origin of generator
 * space — "moving the casing" on canvas actually shifts the WORLD the other
 * way, so dragging the casing writes shadow_offset MINUS the drag delta
 * (the INVERSE of the image's own body drag, which ADDS the delta). Visually
 * only the casing (+ lamp) overlay translates during the gesture; the image
 * backdrop doesn't move until release, when the server re-centers the
 * casing and the image visually shifts opposite — an acceptable snap.
 */
export function applyCasingDrag(
  config: Record<string, unknown>,
  dxPx: number,
  dyPx: number,
  imgPx: number,
): Record<string, unknown> {
  const floorHalf = Number(config.floor_half_size) || 600
  const { dxMm, dyMm } = pxToMm(dxPx, dyPx, imgPx, floorHalf)
  const curX = Number(config.shadow_offset_x) || 0
  const curY = Number(config.shadow_offset_y) || 0
  return {
    ...config,
    shadow_offset_x: round1(curX - dxMm),
    shadow_offset_y: round1(curY - dyMm),
  }
}

const LIGHT_CLAMP = 50

/**
 * Object 3 (Lamp) drag. `xPx`/`yPx` are the lamp's ABSOLUTE screen-px offset
 * from the casing center (not a delta from its previous position — the lamp
 * is a single dot with no accumulated drag state), converted to mm and
 * clamped to +-50mm per the generator's light_x/light_y range.
 */
export function applyLampDrag(
  config: Record<string, unknown>,
  xPx: number,
  yPx: number,
  imgPx: number,
): Record<string, unknown> {
  const floorHalf = Number(config.floor_half_size) || 600
  const { dxMm, dyMm } = pxToMm(xPx, yPx, imgPx, floorHalf)
  return {
    ...config,
    light_x: clamp(round1(dxMm), -LIGHT_CLAMP, LIGHT_CLAMP),
    light_y: clamp(round1(dyMm), -LIGHT_CLAMP, LIGHT_CLAMP),
  }
}

/** Guard below which r0 (the cursor's initial distance to center) is too
 * small to divide by safely — a press essentially on top of the center would
 * otherwise blow the scale factor up to a huge/undefined number on the very
 * first move event. */
const MIN_R0_PX = 8

/**
 * Relative resize scaling for corner-handle drags (image-resize and
 * casing-resize). Previously the live size was set directly from the
 * cursor's absolute distance to the object's center (`r = hypot(cursor -
 * center)`), so the FIRST pointermove after pointerdown snapped the object
 * straight to wherever the cursor happened to be — reported live as
 * "pointer loncat ke size lebih besar" (the object visibly jumps on the very
 * first movement instead of scaling smoothly from where it started).
 *
 * Fixed by scaling relative to the gesture's own start: `S0` is the object's
 * on-screen size at pointerdown, `r0` is the cursor's distance to center at
 * that same moment, and `r` is the cursor's CURRENT distance to center.
 * `newSize = S0 * (r / r0)` — at r == r0 (no movement yet) this returns
 * exactly S0, so there's no jump; the object then scales smoothly in
 * proportion to how far the cursor has moved from its start, not from an
 * arbitrary absolute distance.
 */
export function resizeFromCursor(S0: number, r0: number, r: number): number {
  if (r0 < MIN_R0_PX) return S0
  return S0 * (r / r0)
}

/** Zoom bounds for the canvas toolbar's client-side view scale. */
export const CANVAS_ZOOM_MIN = 0.5
export const CANVAS_ZOOM_MAX = 3

export function clampZoom(z: number): number {
  return clamp(z, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX)
}

/**
 * Toolbar zoom is applied as a CSS `scale()` transform on the square wrapper
 * that all pointer math is scoped to. `getBoundingClientRect()` on a scaled
 * element already reflects the visual (post-transform) size, so a client
 * pointer delta measured against it is in REAL (zoomed) screen px — but the
 * overlay SVG itself renders in LOGICAL (unzoomed) viewBox units, since it
 * shares the same transformed parent and gets magnified along with it.
 * Feeding a real px delta straight into the logical viewBox double-counts
 * the zoom (visually the object appears to move `zoom`x further than the
 * cursor did). Dividing the raw client delta by the current zoom converts it
 * back to logical px, which is what every live-overlay computation expects.
 */
export function adjustDeltaForZoom(dxPx: number, dyPx: number, zoom: number): { dx: number; dy: number } {
  const z = zoom > 0 ? zoom : 1
  return { dx: dxPx / z, dy: dyPx / z }
}

/**
 * The overlay SVG + pointer math must operate on the actual rendered image
 * square, not the (possibly non-square) outer container — the container can
 * be wider or taller than the image due to `object-contain` letterboxing in
 * roomier grid layouts. Given the outer box size, returns the side length of
 * the largest centered square that fits, plus its offset within the box.
 */
export function overlayGeometry(
  containerW: number,
  containerH: number,
): { size: number; offsetX: number; offsetY: number } {
  const size = Math.max(0, Math.min(containerW, containerH))
  return {
    size,
    offsetX: (containerW - size) / 2,
    offsetY: (containerH - size) / 2,
  }
}

/**
 * Build the live CSS `filter` string for the Canvas Editor's original-image
 * backdrop, mirroring the img_brightness/img_contrast/img_saturation config
 * keys consumed server-side by `adjust_image()` in generate_shadow_casing.py.
 *
 * This is only an APPROXIMATION for instant visual feedback in the browser —
 * CSS filter math doesn't exactly match the server's mid-gray-anchored
 * brightness/contrast adjustment. The server-rendered Shadow preview PNG
 * remains the source of truth for what actually gets thresholded/printed.
 *
 * Defaults (0/0/100) produce the no-op string "brightness(1) contrast(1) saturate(100%)".
 */
export function buildImageFilter(config: Record<string, unknown>): string {
  const brightness = Number(config.img_brightness) || 0
  const contrast = Number(config.img_contrast) || 0
  const saturation = config.img_saturation === undefined || config.img_saturation === null
    ? 100
    : Number(config.img_saturation)
  const sat = Number.isFinite(saturation) ? saturation : 100
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${sat}%)`
}

/**
 * Parse the `flooring_shape` config string ("circle" | "square" | "triangle"
 * | "custom" | "rect:W:H" | "oval:W:H") into a base shape id + numeric
 * width/height ratio, mirroring LgConfigEditor's parseShape (v1 form) so the
 * casing overlay draws the same shape the server will render.
 */
export function parseFlooringShape(raw: unknown): { base: string; w: number; h: number } {
  const s = typeof raw === "string" && raw ? raw : "circle"
  const parts = s.split(":")
  if ((parts[0] === "rect" || parts[0] === "oval") && parts.length === 3) {
    const w = Number(parts[1]) || (parts[0] === "rect" ? 3 : 16)
    const h = Number(parts[2]) || (parts[0] === "rect" ? 4 : 9)
    return { base: parts[0], w, h }
  }
  if (parts[0] === "rect") return { base: "rect", w: 3, h: 4 }
  if (parts[0] === "oval") return { base: "oval", w: 16, h: 9 }
  return { base: parts[0] || "circle", w: 1, h: 1 }
}
