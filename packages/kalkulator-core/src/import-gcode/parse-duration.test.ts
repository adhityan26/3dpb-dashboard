import { describe, it, expect } from "vitest"
import { parseSlicerDuration } from "./parse-duration"

describe("parseSlicerDuration", () => {
  it("parses minutes + seconds", () => {
    expect(parseSlicerDuration("18m 24s")).toBe(1104)
  })
  it("parses hours, minutes, seconds", () => {
    expect(parseSlicerDuration("13h 49m 27s")).toBe(49767)
  })
  it("parses days", () => {
    expect(parseSlicerDuration("1d 2h 3m 4s")).toBe(93784)
  })
  it("returns NaN when nothing parseable", () => {
    expect(parseSlicerDuration("")).toBeNaN()
    expect(parseSlicerDuration("soon")).toBeNaN()
  })
})
