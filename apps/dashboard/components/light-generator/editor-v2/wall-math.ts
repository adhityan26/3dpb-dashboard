// Pure geometry + config-editing helpers for the LG editor v2 Wall (θ,z) tab.
// No DOM/React here — mirrors canvas-math.ts's split so the mapping logic is
// trivially unit-testable and shared between live drag math and static
// pin-position rendering.
//
// Coordinate conventions (see preview_renderer.py's _render_wall_unwrap +
// commit 7a4ef14 for the server-side contract this mirrors):
// - The wall unwrap PNG spans the full circumference horizontally: x_px / w *
//   360 = theta_deg, wrapping at the right edge back to 0.
// - Vertically, row 0 (top, yPx = 0) is z_max_mm (top of the wall); row
//   h-1 (bottom, yPx = hPx) is z_min_mm. Linear in between.

export interface UserStem {
  id: string
  theta_deg: number
  z_mm: number
}

export interface Island {
  theta_deg: number
  z_mm: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function wrap360(deg: number): number {
  let d = deg % 360
  if (d < 0) d += 360
  return d
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Snap to the nearest 0.5mm step, matching the z placement granularity used
 * by the generator's stem rasterization. */
function snapZ(n: number): number {
  return Math.round(n * 2) / 2
}

/**
 * Screen px (image pixel space) -> (theta_deg, z_mm). Row 0 (yPx=0) = zMaxMm;
 * yPx=hPx = zMinMm. Theta wraps 0-360, snapped to 1 decimal; z snapped to
 * 0.5mm steps.
 */
export function wallPxToThetaZ(
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  zMinMm: number,
  zMaxMm: number,
): { thetaDeg: number; zMm: number } {
  const thetaRaw = wPx > 0 ? (xPx / wPx) * 360 : 0
  const zFrac = hPx > 0 ? clamp(yPx / hPx, 0, 1) : 0
  const zRaw = zMaxMm - zFrac * (zMaxMm - zMinMm)
  return {
    thetaDeg: round1(wrap360(thetaRaw)),
    zMm: snapZ(clamp(zRaw, Math.min(zMinMm, zMaxMm), Math.max(zMinMm, zMaxMm))),
  }
}

/** Inverse of wallPxToThetaZ: (theta_deg, z_mm) -> screen px. */
export function thetaZToWallPx(
  thetaDeg: number,
  zMm: number,
  wPx: number,
  hPx: number,
  zMinMm: number,
  zMaxMm: number,
): { xPx: number; yPx: number } {
  const xPx = (wrap360(thetaDeg) / 360) * wPx
  const zRange = zMaxMm - zMinMm
  const yPx = zRange !== 0 ? ((zMaxMm - zMm) / zRange) * hPx : 0
  return { xPx, yPx }
}

/** Angular width (degrees) a stem's real print width (mm-equivalent in
 * stencil-theta cells, `stemWidth`) subtends around the wall circumference,
 * given the stencil's theta resolution `nStencilTheta`. */
export function stemAngularWidthDeg(stemWidth: number, nStencilTheta: number): number {
  if (!nStencilTheta) return 0
  return (stemWidth / nStencilTheta) * 360
}

/** Shortest angular distance (degrees, 0-180) between two theta values on the
 * 0-360 wrapping circle. */
function angularDist(a: number, b: number): number {
  const d = Math.abs(wrap360(a) - wrap360(b)) % 360
  return d > 180 ? 360 - d : d
}

function getUserStems(config: Record<string, unknown>): UserStem[] {
  const raw = config.user_stems
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (s): s is UserStem =>
      !!s && typeof s === "object" && typeof (s as UserStem).id === "string" &&
      typeof (s as UserStem).theta_deg === "number" && typeof (s as UserStem).z_mm === "number",
  )
}

/** Immutably add or update (by id) a manual stem in `config.user_stems`. */
export function upsertStem(
  config: Record<string, unknown>,
  stem: UserStem,
): Record<string, unknown> {
  const existing = getUserStems(config)
  const idx = existing.findIndex((s) => s.id === stem.id)
  const next =
    idx >= 0
      ? existing.map((s, i) => (i === idx ? stem : s))
      : [...existing, stem]
  return { ...config, user_stems: next }
}

/** Immutably remove a manual stem by id from `config.user_stems`. */
export function removeStem(config: Record<string, unknown>, id: string): Record<string, unknown> {
  const existing = getUserStems(config)
  return { ...config, user_stems: existing.filter((s) => s.id !== id) }
}

/**
 * Derives the wall's usable z-range (mm) for the UI, mirroring
 * preview_renderer.py's render_shadow_preview:
 *   z_min = base_z = casing_lift + base_thickness
 *   z_max = casing_lift + shell_height (auto-derived when null)
 *
 * This is a documented APPROXIMATION: the server additionally clamps z_max
 * via the light-ray geometry (`min(wall_top, lz*(1 - r_min/floor_half))`),
 * which this client-side helper does not replicate — a small mismatch at the
 * very top of the wall is acceptable for placement purposes, since the
 * server-rendered wall PNG (fetched separately) remains ground truth for
 * what the stencil actually looks like.
 */
export function wallZRange(config: Record<string, unknown>): { zMinMm: number; zMaxMm: number } {
  const casingLift = Number(config.casing_lift) || 0
  const baseThickness = config.base_thickness === undefined ? 2 : Number(config.base_thickness)
  const outerRadius = Number(config.outer_radius) || 100
  const floorHalf = Number(config.floor_half_size) || 600
  const lightZOffset = config.light_z_offset === undefined ? 10 : Number(config.light_z_offset)
  const shellHeightRaw = config.shell_height
  const shellHeight =
    shellHeightRaw === undefined || shellHeightRaw === null
      ? lightZOffset * (floorHalf / outerRadius - 1)
      : Number(shellHeightRaw)

  const zMinMm = casingLift + baseThickness
  const zMaxMm = casingLift + shellHeight
  return { zMinMm, zMaxMm }
}

/**
 * Adds one manual stem per island centroid (`islands`, from /check-islands),
 * skipping any island that already falls within `stemAngularWidthDeg` of an
 * existing user stem (including islands anchored earlier in this same call,
 * so a cluster of nearby islands doesn't spawn a stem per island). Stem ids
 * are `island-<index>-<theta>` for stable, order-independent dedupe.
 */
export function anchorAllIslands(
  config: Record<string, unknown>,
  islands: Island[],
  stemWidth?: number,
  nStencilTheta?: number,
): Record<string, unknown> {
  const width = stemWidth ?? (Number(config.stem_width) || 2)
  const nTheta = nStencilTheta ?? (Number(config.n_stencil_theta) || 512)
  const angularWidth = stemAngularWidthDeg(width, nTheta)

  const placed: UserStem[] = getUserStems(config)
  let next = config
  islands.forEach((island, i) => {
    const tooClose = placed.some((s) => angularDist(s.theta_deg, island.theta_deg) < angularWidth)
    if (tooClose) return
    const stem: UserStem = {
      id: `island-${i}-${round1(island.theta_deg)}`,
      theta_deg: round1(island.theta_deg),
      z_mm: snapZ(island.z_mm),
    }
    placed.push(stem)
    next = upsertStem(next, stem)
  })
  return next
}
