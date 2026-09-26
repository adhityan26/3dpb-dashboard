import { describe, it, expect } from "vitest"
import { parseBinaryStl, exportBinaryStl, scaleMesh, rotateMesh, makeCubeStl } from "../mesh/stl"

describe("binary STL parse/weld/export", () => {
  it("parses a cube and welds shared vertices", () => {
    const stl = makeCubeStl(10)
    const mesh = parseBinaryStl(stl)
    expect(mesh.triVerts.length).toBe(12 * 3)      // 12 triangles
    expect(mesh.vertProperties.length).toBe(8 * 3) // welded to 8 unique vertices
  })

  it("round-trips through export", () => {
    const mesh = parseBinaryStl(makeCubeStl(10))
    const again = parseBinaryStl(exportBinaryStl(mesh))
    expect(again.triVerts.length).toBe(mesh.triVerts.length)
    expect(again.vertProperties.length).toBe(mesh.vertProperties.length)
  })

  it("scaleMesh scales every coordinate uniformly around origin", () => {
    const mesh = parseBinaryStl(makeCubeStl(10))
    const maxBefore = Math.max(...mesh.vertProperties)
    scaleMesh(mesh, 0.5)
    const maxAfter = Math.max(...mesh.vertProperties)
    expect(maxAfter).toBeCloseTo(maxBefore * 0.5, 5)
  })

  it("rejects garbage input", () => {
    expect(() => parseBinaryStl(Buffer.from("solid ascii\n"))).toThrow(/binary STL/)
    expect(() => parseBinaryStl(Buffer.alloc(10))).toThrow(/binary STL/)
  })
})

describe("rotateMesh", () => {
  it("applies X then Y then Z", () => {
    const mesh = { vertProperties: new Float32Array([1, 0, 0]), triVerts: new Uint32Array() }
    // X-rot leaves (1,0,0); Y +90 → (0,0,-1); Z +90 leaves it
    rotateMesh(mesh, [90, 90, 90])
    expect(mesh.vertProperties[0]).toBeCloseTo(0, 6)
    expect(mesh.vertProperties[1]).toBeCloseTo(0, 6)
    expect(mesh.vertProperties[2]).toBeCloseTo(-1, 6)
  })

  it("Z +90 maps +X to +Y", () => {
    const mesh = { vertProperties: new Float32Array([1, 0, 0]), triVerts: new Uint32Array() }
    rotateMesh(mesh, [0, 0, 90])
    expect(mesh.vertProperties[0]).toBeCloseTo(0, 6)
    expect(mesh.vertProperties[1]).toBeCloseTo(1, 6)
  })
})
