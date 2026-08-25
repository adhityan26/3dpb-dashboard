// Shared types for the ring-resizer mesh pipeline.

/** Indexed triangle mesh in manifold-3d Mesh layout (numProp = 3). */
export interface WeldedMesh {
  vertProperties: Float32Array // x,y,z per vertex
  triVerts: Uint32Array        // 3 vertex indices per triangle
}

/** Engrave anchor in base-STL (100%) coordinates. */
export interface AnchorInput {
  pos: [number, number, number]
  normal: [number, number, number] // unit, pointing OUT of the surface
  up: [number, number, number]     // unit, text "up" direction, in surface plane
  textHeightMm: number
  depthMm: number
}

export interface PartResult {
  stl: Buffer
  engraved: boolean
  warning?: string
}
