import { describe, it, expect } from "vitest"
import { filterSections, coerceParamValue, shouldWarnJsonApply } from "../filter-params"
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

describe("coerceParamValue", () => {
  it("number: empty string removes the key", () => {
    const out = coerceParamValue({ n_stencil_theta: 5, other: 1 }, "n_stencil_theta", "", "number")
    expect(out).toEqual({ other: 1 })
    expect(out && "n_stencil_theta" in out).toBe(false)
  })
  it("number: valid numeric string coerces to a number", () => {
    const out = coerceParamValue({}, "outer_radius", "42", "number")
    expect(out).toEqual({ outer_radius: 42 })
  })
  it("number: non-numeric string is ignored (returns null)", () => {
    const out = coerceParamValue({ outer_radius: 5 }, "outer_radius", "abc", "number")
    expect(out).toBeNull()
  })
  it("number: null/undefined also removes the key", () => {
    expect(coerceParamValue({ x: 1 }, "x", null, "number")).toEqual({})
    expect(coerceParamValue({ x: 1 }, "x", undefined, "number")).toEqual({})
  })
  it("boolean: passes through unchanged", () => {
    const out = coerceParamValue({}, "invert_mask", true, "boolean")
    expect(out).toEqual({ invert_mask: true })
  })
})

describe("shouldWarnJsonApply", () => {
  it("no dirty snapshot (draft not dirty) -> never warn", () => {
    expect(shouldWarnJsonApply(null, JSON.stringify({ a: 1 }))).toBe(false)
  })
  it("dirty snapshot matches current config -> no warn (nothing changed underneath)", () => {
    const snap = JSON.stringify({ a: 1 })
    expect(shouldWarnJsonApply(snap, snap)).toBe(false)
  })
  it("dirty snapshot differs from current config -> warn (config changed elsewhere)", () => {
    const snap = JSON.stringify({ a: 1 })
    const current = JSON.stringify({ a: 2 })
    expect(shouldWarnJsonApply(snap, current)).toBe(true)
  })
})
