// Sizing math shared by the production form and the /process API.
// Formula parity with the legacy GL2026 resize-calculator HTML:
//   circ = 2.55 * US + 36.5 (mm), dia = circ / PI, scale = (dia + clearance) / baseBore

export type SizeMode = "us" | "dia" | "circ"

export interface ScaleResult {
  scale: number
  targetDiaMm: number
  usEquivalent: number
  circMm: number
}

export function usToCirc(us: number): number {
  return 2.55 * us + 36.5
}

export function diaToUs(diaMm: number): number {
  return (diaMm * Math.PI - 36.5) / 2.55
}

export function computeScale(opts: {
  mode: SizeMode
  value: number
  clearanceMm: number
  baseBoreMm: number
}): ScaleResult {
  const { mode, value, clearanceMm, baseBoreMm } = opts
  if (!(value > 0) || !(baseBoreMm > 0) || clearanceMm < 0) {
    throw new Error("computeScale: value and baseBoreMm must be > 0, clearanceMm >= 0")
  }
  let diaMm: number
  if (mode === "us") diaMm = usToCirc(value) / Math.PI
  else if (mode === "dia") diaMm = value
  else diaMm = value / Math.PI

  const targetDiaMm = diaMm + clearanceMm
  return {
    scale: targetDiaMm / baseBoreMm,
    targetDiaMm,
    usEquivalent: diaToUs(diaMm),
    circMm: diaMm * Math.PI,
  }
}
