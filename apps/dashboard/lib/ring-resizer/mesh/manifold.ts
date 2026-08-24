import Module from "manifold-3d"
import type { ManifoldToplevel } from "manifold-3d"

let instance: ManifoldToplevel | null = null

/** Lazy WASM singleton — loading manifold takes ~100ms, do it once per process. */
export async function getManifold(): Promise<ManifoldToplevel> {
  if (!instance) {
    instance = await Module()
    instance.setup()
  }
  return instance
}
