import { describe, it, expect } from "vitest"
import { filterSections } from "../filter-params"
import { SECTIONS } from "../../config-params"

describe("filterSections", () => {
  it("empty query returns all sections", () => {
    expect(filterSections(SECTIONS, "")).toHaveLength(SECTIONS.length)
  })
  it("matches by key", () => {
    const out = filterSections(SECTIONS, "n_stencil_theta")
    expect(out).toHaveLength(1)
    expect(out[0].params.map((p) => p.key)).toEqual(["n_stencil_theta"])
  })
  it("matches by label case-insensitive", () => {
    const out = filterSections(SECTIONS, "outer radius")
    expect(out.some((s) => s.params.some((p) => p.key === "outer_radius"))).toBe(true)
  })
})
