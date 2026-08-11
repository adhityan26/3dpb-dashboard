const PLA_PLUS_DENSITY = 1.24
const STENCIL_SOLID_FRACTION = 0.5

function shapeFactors(flooring: string): { area: number; perim: number } {
  const parts = flooring.split(":")
  const shape = parts[0]
  if ((shape === "rect" || shape === "square") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const norm = Math.sqrt(rw * rw + rh * rh)
      return { area: 4 * rw * rh / (Math.PI * norm * norm), perim: 2 * (rw + rh) / (Math.PI * norm) }
    }
  }
  if (shape === "square") return { area: 2 / Math.PI, perim: 4 * Math.SQRT2 / (2 * Math.PI) }
  if (shape === "oval" && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const mx = Math.max(rw, rh)
      return { area: (rw * rh) / (mx * mx), perim: 1.0 }
    }
  }
  return { area: 1, perim: 1 }
}

export function computeObjectInfo(config: Record<string, unknown>) {
  const outerRadius    = Number(config.outer_radius)     || 0
  const lightZOffset   = Number(config.light_z_offset)   || 0
  const floorHalfSize  = Number(config.floor_half_size)  || 0
  const casingLift     = Number(config.casing_lift)      || 0
  const baseThickness  = Number(config.base_thickness)   || 0
  const shellThickness = Number(config.shell_thickness)  || 3
  const baseRadius     = Number(config.base_radius)      || outerRadius
  const pillarOuterR   = Number(config.pillar_outer_r)   || 5
  const pillarInnerR   = Number(config.pillar_inner_r)   || 3
  const ledSocketH     = Number(config.led_socket_height)|| 0
  const skipPillar     = !!config.skip_led_pillar

  const shellHeightRaw = config.shell_height
  const shellHeightAuto = outerRadius > 0 ? lightZOffset * (floorHalfSize / outerRadius - 1) : 0
  const isAuto = shellHeightRaw == null || shellHeightRaw === "" || Number(shellHeightRaw) === 0
  const shellHeight = isAuto ? shellHeightAuto : Number(shellHeightRaw)
  const totalHeight = casingLift + baseThickness + shellHeight

  const flooring = String(config.flooring_shape ?? "circle").toLowerCase().trim()
  const parts = flooring.split(":")
  const shape = parts[0]
  let shadowDesc = ""
  if (!flooring || flooring === "circle") {
    shadowDesc = `⌀ ${((floorHalfSize * 2) / 10).toFixed(0)} cm`
  } else if ((shape === "rect" || shape === "oval") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      if (shape === "rect") {
        const norm = Math.sqrt(rw * rw + rh * rh)
        shadowDesc = `${((floorHalfSize * 2 * rw) / norm / 10).toFixed(0)} × ${((floorHalfSize * 2 * rh) / norm / 10).toFixed(0)} cm`
      } else {
        const mx = Math.max(rw, rh)
        shadowDesc = `${((floorHalfSize * 2 * rw) / mx / 10).toFixed(0)} × ${((floorHalfSize * 2 * rh) / mx / 10).toFixed(0)} cm`
      }
    }
  } else if (shape === "square") {
    const side = ((floorHalfSize * 2) / Math.SQRT2 / 10).toFixed(0)
    shadowDesc = `${side} × ${side} cm`
  } else {
    shadowDesc = `max ⌀ ${((floorHalfSize * 2) / 10).toFixed(0)} cm`
  }

  let casingDimDesc = ""
  if (!flooring || flooring === "circle") {
    casingDimDesc = `⌀ ${(outerRadius * 2).toFixed(0)} mm`
  } else if ((shape === "rect" || shape === "square") && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const norm = Math.sqrt(rw * rw + rh * rh)
      casingDimDesc = `${((outerRadius * 2 * rw) / norm).toFixed(0)} × ${((outerRadius * 2 * rh) / norm).toFixed(0)} mm`
    }
  } else if (shape === "oval" && parts.length === 3) {
    const rw = Number(parts[1]), rh = Number(parts[2])
    if (rw > 0 && rh > 0) {
      const mx = Math.max(rw, rh)
      casingDimDesc = `${((outerRadius * 2 * rw) / mx).toFixed(0)} × ${((outerRadius * 2 * rh) / mx).toFixed(0)} mm`
    }
  } else {
    casingDimDesc = `⌀ ${(outerRadius * 2).toFixed(0)} mm`
  }

  const coverType = String(config.cover_type ?? "bottom")
  const isTopCover = coverType === "top"

  const sf = shapeFactors(flooring)
  // baseVolMm3 estimates a solid disk of baseThickness — in 'bottom' mode
  // that's the floor plate, in 'top' mode it doubles as the top cover slab
  // (same rough slab volume estimate either way, so no separate formula
  // needed for the cover itself).
  const baseVolMm3  = Math.PI * baseRadius * baseRadius * baseThickness * sf.area
  const wallPerimMm = 2 * Math.PI * outerRadius * sf.perim
  const wallVolMm3  = wallPerimMm * shellThickness * shellHeight * STENCIL_SOLID_FRACTION
  // The LED pillar only exists in 'bottom' mode — 'top' mode mounts the LED
  // in a recess machined into the cover slab, already covered by baseVolMm3.
  const pillarVolMm3 = (skipPillar || isTopCover) ? 0 : Math.PI * (pillarOuterR ** 2 - pillarInnerR ** 2) * (shellHeight + ledSocketH)
  const filamentG   = Math.round((baseVolMm3 + wallVolMm3 + pillarVolMm3) / 1000 * PLA_PLUS_DENSITY)

  return {
    casingDimDesc,
    shellHeight: shellHeight.toFixed(1),
    isAuto,
    totalHeight: totalHeight.toFixed(1),
    lightZAbsolute: (casingLift + baseThickness + shellHeight + lightZOffset).toFixed(1),
    lightZOffset: lightZOffset.toFixed(1),
    shadowDesc,
    filamentG,
  }
}
