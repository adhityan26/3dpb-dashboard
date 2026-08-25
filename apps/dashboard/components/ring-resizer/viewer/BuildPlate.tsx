"use client"

import { Grid } from "@react-three/drei"

// Transparent reference grid on the XY plane (z-up scene). Rotated because the
// drei Grid's default lies in XZ. Grid-only (no solid underlay) so it never
// occludes the model at grazing camera angles.
export function BuildPlate({
  size,
  cellSize = 5,
  sectionSize = 25,
}: {
  size: number
  cellSize?: number
  sectionSize?: number
}) {
  return (
    <Grid
      args={[size, size]}
      cellSize={cellSize}
      sectionSize={sectionSize}
      infiniteGrid={false}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  )
}
