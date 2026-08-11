// Pure geometry helpers for the LG editor v2 Canvas Shadow direct-manipulation
// overlay. No DOM/React here — keeps these trivially unit-testable and usable
// both for live drag math and for computing static handle positions.
//
// Coordinate conventions:
// - The preview PNG is always square, `imgPx` wide/tall on screen.
// - The floor spans [-floorHalf, +floorHalf] mm across the FULL image width,
//   i.e. imgPx screen-px maps to 2*floorHalf mm, so 1 px = (2*floorHalf/imgPx) mm.
// - Screen y grows downward; mm y (per the generator's PY = cy - FY convention)
//   grows upward. So a positive screen-space dy (drag down) must map to a
//   NEGATIVE mm dy.

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

/**
 * Body drag ("grab the shadow, move it") updates shadow_offset_x/y.
 * Sign: dragging right (+dxPx) increases offset_x; dragging DOWN (+dyPx)
 * DECREASES offset_y (screen down = -y mm, per pxToMm above), matching the
 * preview's PY = cy - FY convention where a larger offset_y pushes the
 * shadow further from the camera row = visually UP.
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
 * Floor ring resize. The ring's handle sits at `handleRadiusPx` from image
 * center; the ring's rest position (radius = imgHalf px, i.e. hugging the
 * image edge) represents the CURRENT floor_half_size in mm. Dragging the
 * handle to a new radius r means "I want the floor edge to be where the ring
 * currently is" — i.e. the physical mm distance that used to span imgHalf px
 * now spans r px, so the same imgHalf-px screen width now represents FEWER
 * mm when r < imgHalf (dragging inward shrinks floor_half_size), and MORE mm
 * when r > imgHalf (dragging outward grows it):
 *
 *   newFloorHalf = floorHalf * (imgHalf / r)
 *
 * Example: floorHalf=600mm, imgHalf=200px, drag handle in to r=100px (half
 * the radius) => newFloorHalf = 600 * 200/100 = 1200mm (floor now covers
 * TWICE the physical area within the same screen circle — smaller ring
 * radius = zoomed-in view = larger floor_half_size represented).
 */
export function applyFloorResizeDrag(
  config: Record<string, unknown>,
  handleRadiusPx: number,
  imgPx: number,
): Record<string, unknown> {
  const floorHalf = Number(config.floor_half_size) || 600
  const imgHalf = imgPx / 2
  if (handleRadiusPx <= 0 || imgHalf <= 0) return { ...config }
  const raw = floorHalf * (imgHalf / handleRadiusPx)
  const clamped = Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, raw))
  return {
    ...config,
    floor_half_size: Math.round(clamped),
  }
}

/**
 * Padding ring <-> mask_padding_pct mapping.
 * Padding pct adds pct% of max(h,w) to EACH side, so the content circle's
 * radius fraction of the full image is f = 1 / (1 + 2*pct/100).
 * Inverting: pct = 50 * (1 - f) / f.
 */
export function paddingPctToRadiusFraction(pct: number): number {
  const p = Math.max(0, Math.min(100, pct))
  return 1 / (1 + (2 * p) / 100)
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

function radiusFractionToPaddingPct(f: number): number {
  if (f <= 0) return 100
  const pct = (50 * (1 - f)) / f
  return Math.round(Math.max(0, Math.min(100, pct)))
}

/**
 * Padding ring resize. Also flips into manual mode (auto_fit_mask=false)
 * since a manual drag is an explicit override of auto-fit.
 */
export function applyPaddingDrag(
  config: Record<string, unknown>,
  handleRadiusPx: number,
  imgPx: number,
): Record<string, unknown> {
  const imgHalf = imgPx / 2
  const f = imgHalf > 0 ? handleRadiusPx / imgHalf : 0
  const pct = radiusFractionToPaddingPct(f)
  return {
    ...config,
    mask_padding_pct: pct,
    auto_fit_mask: false,
  }
}
