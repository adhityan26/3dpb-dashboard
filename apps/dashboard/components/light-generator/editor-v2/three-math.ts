// Pure geometry helpers for the LG editor v2 3D tab's wireframe context
// scene (casing wall outline, LED disc, stem gizmos). No three.js/React
// imports here — keeps the (theta,z)->world-space math trivially
// unit-testable, mirroring canvas-math.ts / wall-math.ts's split.
//
// World-space convention (matches Lg3DViewer / v1's LgStlViewer): the STL's
// own bbox is translated so bbox min z = 0 and x/y are centered, with z
// pointing "up" the wall (away from the base). This module's outputs are
// expressed in that same mm space so they can be drawn directly alongside
// the loaded STL mesh.

import { wallZRange } from "./wall-math"

/** Wall/casing outer radius (mm), defaulting like canvas-math/wall-math. */
export function casingOuterRadius(config: Record<string, unknown>): number {
  return Number(config.outer_radius) || 100
}

/**
 * z height (mm) of the LED light source, mirroring preview_renderer.py's
 * light-ray geometry: z_light = casing_lift + shell_height(auto-derived when
 * null) + light_z_offset. `wallZRange`'s zMaxMm already equals
 * casing_lift + shell_height, so this just adds light_z_offset on top.
 * APPROXIMATION only (see wallZRange's own doc comment) — good enough to
 * place a wireframe LED disc, not for print geometry.
 */
export function zLightMm(config: Record<string, unknown>): number {
  const { zMaxMm } = wallZRange(config)
  const lightZOffset = config.light_z_offset === undefined ? 10 : Number(config.light_z_offset)
  return zMaxMm + lightZOffset
}

/**
 * Which wall edge a stem is structurally anchored to, mirroring
 * preview_renderer.py's `stem_anchor = "top" if cover_type == "top" else
 * "bottom"` (and check_islands.py's identical rule). Stems anchored "bottom"
 * run from the wall's base (zMinMm) up to the user-placed z_mm; stems
 * anchored "top" run from the user-placed z_mm up to the wall's top
 * (zMaxMm) — i.e. hanging down from the cover.
 */
export function stemAnchorEdge(config: Record<string, unknown>): "top" | "bottom" {
  return String(config.cover_type ?? "bottom") === "top" ? "top" : "bottom"
}

export interface StemGizmoTransform {
  id: string
  /** World-space x/y (mm) of the stem's center, on the wall's outer radius. */
  x: number
  y: number
  /** World-space z (mm) of the gizmo box's vertical center. */
  z: number
  /** Vertical extent (mm) of the gizmo box, always >= 0. */
  height: number
}

/**
 * Maps each `config.user_stems` entry to a world-space thin-box transform
 * for the 3D tab's stem gizmos: (theta_deg, z_mm) -> (x, y) on the wall's
 * outer_radius circle (theta measured the same way as wall-math's
 * thetaZToWallPx / preview_renderer.py's wall unwrap: 0deg at +x, increasing
 * counter-clockwise), and a vertical box spanning from the wall's structural
 * anchor edge (top or bottom, per stemAnchorEdge) to the stem's z_mm.
 *
 * Invalid/malformed entries in user_stems are skipped rather than throwing,
 * matching wall-math's getUserStems tolerance for partial data.
 */
export function stemGizmoTransforms(config: Record<string, unknown>): StemGizmoTransform[] {
  const raw = config.user_stems
  if (!Array.isArray(raw)) return []
  const radius = casingOuterRadius(config)
  const { zMinMm, zMaxMm } = wallZRange(config)
  const anchor = stemAnchorEdge(config)
  const anchorZ = anchor === "top" ? zMaxMm : zMinMm

  const out: StemGizmoTransform[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const id = (entry as { id?: unknown }).id
    const thetaDeg = (entry as { theta_deg?: unknown }).theta_deg
    const zMm = (entry as { z_mm?: unknown }).z_mm
    if (typeof id !== "string" || typeof thetaDeg !== "number" || typeof zMm !== "number") continue

    const thetaRad = (thetaDeg * Math.PI) / 180
    const x = radius * Math.cos(thetaRad)
    const y = radius * Math.sin(thetaRad)
    const zLo = Math.min(anchorZ, zMm)
    const zHi = Math.max(anchorZ, zMm)
    out.push({
      id,
      x,
      y,
      z: (zLo + zHi) / 2,
      height: Math.max(0, zHi - zLo),
    })
  }
  return out
}
